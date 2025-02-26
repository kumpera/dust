import type {
  EnterpriseUpgradeFormType,
  PlanType,
  SubscriptionType,
} from "@dust-tt/types";
import { sendUserOperationMessage } from "@dust-tt/types";
import type Stripe from "stripe";

import type { Authenticator } from "@app/lib/auth";
import { sendProactiveTrialCancelledEmail } from "@app/lib/email";
import { Plan, Subscription } from "@app/lib/models/plan";
import { Workspace } from "@app/lib/models/workspace";
import type { PlanAttributes } from "@app/lib/plans/free_plans";
import { FREE_NO_PLAN_DATA } from "@app/lib/plans/free_plans";
import { PRO_PLAN_SEAT_29_CODE } from "@app/lib/plans/plan_codes";
import {
  cancelSubscriptionImmediately,
  createProPlanCheckoutSession,
  getStripeSubscription,
} from "@app/lib/plans/stripe";
import { countActiveSeatsInWorkspace } from "@app/lib/plans/usage/seats";
import { frontSequelize } from "@app/lib/resources/storage";
import { generateModelSId } from "@app/lib/utils";
import { getWorkspaceFirstAdmin } from "@app/lib/workspace";
import { checkWorkspaceActivity } from "@app/lib/workspace_usage";
import logger from "@app/logger/logger";

// Helper function to render PlanType from PlanAttributes
export function renderPlanFromModel({
  plan,
}: {
  plan: PlanAttributes;
}): PlanType {
  return {
    code: plan.code,
    name: plan.name,
    limits: {
      assistant: {
        isSlackBotAllowed: plan.isSlackbotAllowed,
        maxMessages: plan.maxMessages,
        maxMessagesTimeframe: plan.maxMessagesTimeframe,
      },
      connections: {
        isConfluenceAllowed: plan.isManagedConfluenceAllowed,
        isSlackAllowed: plan.isManagedSlackAllowed,
        isNotionAllowed: plan.isManagedNotionAllowed,
        isGoogleDriveAllowed: plan.isManagedGoogleDriveAllowed,
        isGithubAllowed: plan.isManagedGithubAllowed,
        isIntercomAllowed: plan.isManagedIntercomAllowed,
        isWebCrawlerAllowed: plan.isManagedWebCrawlerAllowed,
      },
      dataSources: {
        count: plan.maxDataSourcesCount,
        documents: {
          count: plan.maxDataSourcesDocumentsCount,
          sizeMb: plan.maxDataSourcesDocumentsSizeMb,
        },
      },
      users: {
        maxUsers: plan.maxUsersInWorkspace,
      },
      canUseProduct: plan.canUseProduct,
    },
    trialPeriodDays: plan.trialPeriodDays,
  };
}

// Helper in charge of rendering the SubscriptionType object form PlanAttributes and optionally an
// active Subscription model.
export function renderSubscriptionFromModels({
  plan,
  activeSubscription,
}: {
  plan: PlanAttributes;
  activeSubscription: Subscription | null;
}): SubscriptionType {
  return {
    status: activeSubscription?.status ?? "active",
    trialing: activeSubscription?.trialing === true,
    sId: activeSubscription?.sId || null,
    stripeSubscriptionId: activeSubscription?.stripeSubscriptionId || null,
    startDate: activeSubscription?.startDate?.getTime() || null,
    endDate: activeSubscription?.endDate?.getTime() || null,
    paymentFailingSince:
      activeSubscription?.paymentFailingSince?.getTime() || null,
    plan: renderPlanFromModel({ plan }),
  };
}

/**
 * Internal function to subscribe to the FREE_NO_PLAN.
 * This is the only plan without a database entry: no need to create a subscription, we just end the active one if any.
 */
export const internalSubscribeWorkspaceToFreeNoPlan = async ({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<SubscriptionType> => {
  const workspace = await Workspace.findOne({
    where: { sId: workspaceId },
  });
  if (!workspace) {
    throw new Error(`Cannot find workspace ${workspaceId}`);
  }
  const now = new Date();

  const activeSubscription = await Subscription.findOne({
    where: { workspaceId: workspace.id, status: "active" },
  });

  if (activeSubscription) {
    await frontSequelize.transaction(async (t) => {
      // End the subscription
      const endedStatus = activeSubscription.stripeSubscriptionId
        ? "ended_backend_only"
        : "ended";

      await activeSubscription.update(
        {
          status: endedStatus,
          endDate: now,
        },
        { transaction: t }
      );
    });

    // Notify Stripe that we ended the subscription if the subscription was a paid one
    if (activeSubscription?.stripeSubscriptionId) {
      await cancelSubscriptionImmediately({
        stripeSubscriptionId: activeSubscription.stripeSubscriptionId,
      });
    }
  }

  const plan: PlanAttributes = FREE_NO_PLAN_DATA;
  return renderSubscriptionFromModels({
    plan,
    // No active subscription for FREE_NO_PLAN
    activeSubscription: null,
  });
};

/**
 * TODO DAPH RENAME THIS FUNCTION -> WORKS FOR ANY TYPE OF PLAN UNLESS PRO PLAN THAT NEEDS A CHECKOUT SESSION
 * Internal function to subscribe to a new Plan.
 * The new plan must be a free plan because the new subscription is created without Stripe data.
 */
export const internalSubscribeWorkspaceToFreePlan = async ({
  workspaceId,
  planCode,
  stripeSubscriptionId,
}: {
  workspaceId: string;
  planCode: string;
  stripeSubscriptionId?: string;
}): Promise<SubscriptionType> => {
  const workspace = await Workspace.findOne({
    where: { sId: workspaceId },
  });
  if (!workspace) {
    throw new Error(`Cannot find workspace ${workspaceId}`);
  }
  const newPlan = await Plan.findOne({
    where: { code: planCode },
  });
  if (!newPlan) {
    throw new Error(`Cannot subscribe to plan ${planCode}:  not found.`);
  }

  const now = new Date();

  // We search for an active subscription for this workspace
  const activeSubscription = await Subscription.findOne({
    where: { workspaceId: workspace.id, status: "active" },
  });

  // Prevent subscribing to the same plan
  if (activeSubscription && activeSubscription.planId === newPlan.id) {
    throw new Error(
      `Cannot subscribe to plan ${planCode}: already subscribed.`
    );
  }

  // Prevent subscribing if the new plan has less users allowed then the current one on the workspace
  if (newPlan.maxUsersInWorkspace !== -1) {
    const activeSeats = await countActiveSeatsInWorkspace(workspace.sId);
    if (activeSeats > newPlan.maxUsersInWorkspace) {
      throw new Error(
        `Cannot subscribe to plan ${planCode}: new plan has less users allowed than currently in workspace.`
      );
    }
  }

  // Proceed to the termination of the active subscription (if any) and creation of the new one
  const newSubscription = await frontSequelize.transaction(async (t) => {
    if (activeSubscription) {
      const endedStatus = activeSubscription.stripeSubscriptionId
        ? "ended_backend_only"
        : "ended";

      await activeSubscription.update(
        {
          status: endedStatus,
          endDate: now,
        },
        { transaction: t }
      );
    }

    return Subscription.create(
      {
        sId: generateModelSId(),
        workspaceId: workspace.id,
        planId: newPlan.id,
        status: "active",
        startDate: now,
        stripeSubscriptionId: stripeSubscriptionId ?? null,
      },
      { transaction: t }
    );
  });

  // Notify Stripe that we ended the subscription if the subscription was a paid one
  if (activeSubscription?.stripeSubscriptionId) {
    await cancelSubscriptionImmediately({
      stripeSubscriptionId: activeSubscription.stripeSubscriptionId,
    });
  }

  return renderSubscriptionFromModels({
    plan: newPlan,
    activeSubscription: newSubscription,
  });
};

export const pokeUpgradeWorkspaceToEnterprise = async (
  auth: Authenticator,
  enterpriseDetails: EnterpriseUpgradeFormType
) => {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Cannot find workspace.");
  }

  if (!auth.isDustSuperUser()) {
    throw new Error("Cannot upgrade workspace to plan: not allowed.");
  }

  const plan = await Plan.findOne({
    where: {
      code: enterpriseDetails.planCode,
    },
  });
  if (!plan) {
    throw new Error("The provided plan code does not exist.");
  }

  // End the current subscription if any.
  await internalSubscribeWorkspaceToFreePlan({
    workspaceId: owner.sId,
    planCode: plan.code,
    stripeSubscriptionId: enterpriseDetails.stripeSubscriptionId,
  });
};

/**
 * Internal function to create a PlanInvitation for the workspace.
 */
export const pokeUpgradeWorkspaceToPlan = async (
  auth: Authenticator,
  planCode: string
): Promise<void> => {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Cannot find workspace}");
  }

  if (!auth.isDustSuperUser()) {
    throw new Error("Cannot upgrade workspace to plan: not allowed.");
  }

  const newPlan = await Plan.findOne({
    where: { code: planCode },
  });
  if (!newPlan) {
    throw new Error(
      `Cannot upgrade workspace to plan ${planCode}: plan not found.`
    );
  }

  // We search for an active subscription for this workspace
  const activeSubscription = auth.subscription();
  if (activeSubscription && activeSubscription.plan.code === newPlan.code) {
    throw new Error(
      `Cannot subscribe to plan ${planCode}: already subscribed.`
    );
  }

  if (newPlan.code === PRO_PLAN_SEAT_29_CODE) {
    throw new Error(
      `Cannot subscribe to plan ${planCode}: it is the pro plan which requires a stripe subscription.`
    );
  }

  await internalSubscribeWorkspaceToFreePlan({
    workspaceId: owner.sId,
    planCode: newPlan.code,
  });
  return;
};

// Returns the Stripe checkout URL for the pro plan.
export const getCheckoutUrlForUpgrade = async (
  auth: Authenticator
): Promise<{ checkoutUrl: string; plan: PlanType }> => {
  const owner = auth.workspace();

  if (!owner) {
    throw new Error(
      "Unauthorized `auth` data: cannot process to subscription of new Plan."
    );
  }

  const proPlan = await Plan.findOne({
    where: { code: PRO_PLAN_SEAT_29_CODE },
  });
  if (!proPlan) {
    throw new Error(
      `Cannot subscribe to plan ${PRO_PLAN_SEAT_29_CODE}: not found.`
    );
  }

  const existingSubscription = auth.subscription();
  if (
    existingSubscription &&
    existingSubscription.plan.code === PRO_PLAN_SEAT_29_CODE
  ) {
    throw new Error(
      `Cannot subscribe to plan ${PRO_PLAN_SEAT_29_CODE}: already subscribed.`
    );
  }

  // We enter Stripe Checkout flow
  const checkoutUrl = await createProPlanCheckoutSession({
    auth,
  });

  if (!checkoutUrl) {
    throw new Error(
      `Cannot subscribe to plan ${PRO_PLAN_SEAT_29_CODE}: error while creating Stripe Checkout session (URL is null).`
    );
  }

  return {
    checkoutUrl,
    plan: renderPlanFromModel({ plan: proPlan }),
  };
};

/**
 * Proactively cancel inactive trials.
 */
export async function maybeCancelInactiveTrials(
  eventStripeSubscription: Stripe.Subscription
) {
  const { id: stripeSubscriptionId } = eventStripeSubscription;

  const subscription = await Subscription.findOne({
    where: { stripeSubscriptionId },
    include: [Workspace],
  });

  // Bail early if the DB subscription is not in trial mode.
  if (!subscription || !subscription.trialing) {
    return;
  }

  const { workspace } = subscription;

  // This function can get called if the subscription is upgraded before the end of the trial.
  // Ensure that the Stripe subscription still has a status set to `trialing`.
  const stripeSubscription = await getStripeSubscription(stripeSubscriptionId);
  if (!stripeSubscription || stripeSubscription.status !== "trialing") {
    logger.info(
      { action: "cancelling-trial", workspaceId: workspace.sId },
      "Proactive trial cancellation skipped due to active subscription."
    );

    return;
  }

  const isWorkspaceActive = await checkWorkspaceActivity(workspace);

  if (!isWorkspaceActive) {
    logger.info(
      { action: "cancelling-trial", workspaceId: workspace.sId },
      "Cancelling inactive trial."
    );

    await cancelSubscriptionImmediately({
      stripeSubscriptionId,
    });

    const firstAdmin = await getWorkspaceFirstAdmin(workspace);
    if (!firstAdmin) {
      logger.info(
        { action: "cancelling-trial", workspaceId: workspace.sId },
        "No first adming found -- skipping email."
      );

      return;
    } else {
      await sendProactiveTrialCancelledEmail(firstAdmin.email);
    }

    await sendUserOperationMessage({
      logger,
      message: `Trial for workspace ${workspace.sId} cancelled proactively!`,
    });
  }
}

export async function getSubscriptionForStripeId(
  stripeSubscriptionId: string
): Promise<SubscriptionType | null> {
  const res = await Subscription.findOne({
    where: { stripeSubscriptionId },
    include: [Plan],
  });

  if (!res) {
    return null;
  }

  return renderSubscriptionFromModels({
    plan: res.plan,
    activeSubscription: res,
  });
}
