import { BarHeader, Page, Spinner2 } from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React, { useEffect } from "react";

import config from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { getStripeSubscription } from "@app/lib/plans/stripe";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  user: UserType;
}>(async (context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();
  if (!owner || !auth.isAdmin() || !subscription || !user) {
    return {
      notFound: true,
    };
  }

  if (subscription.stripeSubscriptionId) {
    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );
    if (!stripeSubscription) {
      return {
        notFound: true,
      };
    }
    stripeSubscription;
  }

  return {
    props: {
      owner,
      subscription,
      gaTrackingId: config.getGaTrackingId(),
      user,
    },
  };
});

export default function PaymentProcessing({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  useEffect(() => {
    if (router.query.type === "succeeded") {
      if (subscription.plan.code === router.query.plan_code) {
        // Then we remove the query params to avoid going through this logic again.
        void router.replace({ pathname: `/w/${owner.sId}/congratulations` });
      } else {
        // If the Stripe webhook is not yet received, we try waiting for it and reload the page every 5 seconds until it's done.
        setTimeout(() => {
          void router.reload();
        }, 5000);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally passing an empty dependency array to execute only once

  return (
    <>
      <div className="mb-10">
        <BarHeader title={"Dust"} className="ml-10 lg:ml-0" />
      </div>
      <Page>
        <div className="flex h-full w-full flex-col	items-center justify-center gap-2">
          <div>
            <Spinner2 size="xl" />
          </div>
          <div>
            <Page.P>Processing</Page.P>
          </div>
        </div>
      </Page>
    </>
  );
}
