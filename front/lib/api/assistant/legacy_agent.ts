import type {
  AgentActionConfigurationType,
  AgentActionEvent,
  AgentActionSpecification,
  AgentActionSuccessEvent,
  AgentConfigurationType,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentGenerationSuccessEvent,
  AgentMessageSuccessEvent,
  AgentMessageType,
  ConversationType,
  GenerationTokensEvent,
  LightAgentConfigurationType,
  Result,
  UserMessageType,
} from "@dust-tt/types";
import {
  assertNever,
  cloneBaseConfig,
  DustProdActionRegistry,
  Err,
  GPT_3_5_TURBO_MODEL_CONFIG,
  GPT_4_TURBO_MODEL_CONFIG,
  isDustAppRunConfiguration,
  isProcessConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
  Ok,
} from "@dust-tt/types";

import { runActionStreamed } from "@app/lib/actions/server";
import {
  generateDustAppRunSpecification,
  runDustApp,
} from "@app/lib/api/assistant/actions/dust_app_run";
import {
  generateRetrievalSpecification,
  runRetrieval,
} from "@app/lib/api/assistant/actions/retrieval";
import {
  generateTablesQuerySpecification,
  runTablesQuery,
} from "@app/lib/api/assistant/actions/tables_query";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import {
  constructPrompt,
  renderConversationForModel,
  runGeneration,
} from "@app/lib/api/assistant/generation";
import type { Authenticator } from "@app/lib/auth";
import { deprecatedGetFirstActionConfiguration } from "@app/lib/deprecated_action_configurations";
import logger from "@app/logger/logger";

import { generateProcessSpecification, runProcess } from "./actions/process";

/**
 * Action Inputs generation.
 */

// This method is used by actions to generate its inputs if needed.
async function generateActionInputs(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  specification: AgentActionSpecification,
  conversation: ConversationType,
  userMessage: UserMessageType
): Promise<Result<Record<string, string | boolean | number>, Error>> {
  // We inject the prompt of the model so that its input generation behavior can be modified by its
  // instructions. It also injects context about the local time. If there is no generation phase we
  // default to a generic prompt.
  const prompt = await constructPrompt(
    auth,
    userMessage,
    configuration,
    "You are a conversational assistant with access to function calling."
  );

  const MIN_GENERATION_TOKENS = 2048;

  const model: { providerId: string; modelId: string } = !auth.isUpgraded()
    ? {
        providerId: GPT_3_5_TURBO_MODEL_CONFIG.providerId,
        modelId: GPT_3_5_TURBO_MODEL_CONFIG.modelId,
      }
    : {
        providerId: GPT_4_TURBO_MODEL_CONFIG.providerId,
        modelId: GPT_4_TURBO_MODEL_CONFIG.modelId,
      };

  const contextSize = auth.isUpgraded()
    ? GPT_4_TURBO_MODEL_CONFIG.contextSize
    : GPT_3_5_TURBO_MODEL_CONFIG.contextSize;

  // Turn the conversation into a digest that can be presented to the model.
  const modelConversationRes = await renderConversationForModel({
    conversation,
    model,
    prompt,
    allowedTokenCount: contextSize - MIN_GENERATION_TOKENS,
  });

  if (modelConversationRes.isErr()) {
    return modelConversationRes;
  }

  const config = cloneBaseConfig(
    DustProdActionRegistry["assistant-v2-inputs-generator"].config
  );
  config.MODEL.function_call = specification.name;
  config.MODEL.provider_id = model.providerId;
  config.MODEL.model_id = model.modelId;

  const res = await runActionStreamed(
    auth,
    "assistant-v2-inputs-generator",
    config,
    [
      {
        conversation: modelConversationRes.value.modelConversation,
        specification,
        prompt,
      },
    ]
  );

  if (res.isErr()) {
    return new Err(
      new Error(
        `Error generating action inputs: [${res.error.type}] ${res.error.message}`
      )
    );
  }

  const { eventStream } = res.value;

  const output: Record<string, string | boolean | number> = {};

  for await (const event of eventStream) {
    if (event.type === "error") {
      return new Err(
        new Error(`Error generating action inputs: ${event.content.message}`)
      );
    }

    if (event.type === "block_execution") {
      const e = event.content.execution[0][0];
      if (e.error) {
        return new Err(new Error(`Error generating action inputs: ${e.error}`));
      }

      if (event.content.block_name === "OUTPUT" && e.value) {
        const v = e.value as any;
        for (const k in v) {
          if (
            typeof v[k] === "string" ||
            typeof v[k] === "boolean" ||
            typeof v[k] === "number"
          ) {
            output[k] = v[k];
          }
        }
      }
    }
  }

  return new Ok(output);
}

/**
 * Agent execution.
 */

// This interface is used to execute an agent. It is not in charge of creating the AgentMessage,
// nor updating it (responsability of the caller based on the emitted events).
export async function* runLegacyAgent(
  auth: Authenticator,
  configuration: LightAgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType,
  agentMessage: AgentMessageType
): AsyncGenerator<
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent,
  void
> {
  const fullConfiguration = await getAgentConfiguration(
    auth,
    configuration.sId
  );

  if (!fullConfiguration) {
    throw new Error(
      `Unreachable: could not find detailed configuration for agent ${configuration.sId}`
    );
  }

  const action = deprecatedGetFirstActionConfiguration(fullConfiguration);

  if (action !== null) {
    for await (const event of runAction(auth, {
      configuration: fullConfiguration,
      conversation,
      userMessage,
      agentMessage,
      action,
    })) {
      yield event;
    }
  }

  // Then run the generation if a configuration is present.
  if (configuration.generation !== null) {
    const eventStream = runGeneration(
      auth,
      fullConfiguration,
      conversation,
      userMessage,
      agentMessage
    );

    for await (const event of eventStream) {
      switch (event.type) {
        case "generation_tokens":
          yield event;
          break;

        case "generation_error":
          yield {
            type: "agent_error",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
            },
          };
          return;

        case "generation_cancel":
          yield {
            type: "agent_generation_cancelled",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
          };
          return;

        case "generation_success":
          yield {
            type: "agent_generation_success",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            text: event.text,
          };

          agentMessage.content = event.text;
          break;

        default:
          ((event: never) => {
            logger.error("Unknown `runAgent` event type", event);
          })(event);
          return;
      }
    }
  }

  agentMessage.status = "succeeded";
  yield {
    type: "agent_message_success",
    created: Date.now(),
    configurationId: configuration.sId,
    messageId: agentMessage.sId,
    message: agentMessage,
  };
}

async function* runAction(
  auth: Authenticator,
  {
    configuration,
    conversation,
    userMessage,
    agentMessage,
    action,
  }: {
    configuration: AgentConfigurationType;
    conversation: ConversationType;
    userMessage: UserMessageType;
    agentMessage: AgentMessageType;
    action: AgentActionConfigurationType;
  }
): AsyncGenerator<
  | AgentActionEvent
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent,
  void
> {
  const now = Date.now();

  let specRes: Result<AgentActionSpecification, Error> | null = null;
  if (isRetrievalConfiguration(action)) {
    specRes = await generateRetrievalSpecification(auth, {
      actionConfiguration: action,
    });
  } else if (isDustAppRunConfiguration(action)) {
    specRes = await generateDustAppRunSpecification(auth, {
      actionConfiguration: action,
    });
  } else if (isTablesQueryConfiguration(action)) {
    specRes = await generateTablesQuerySpecification(auth);
  } else if (isProcessConfiguration(action)) {
    specRes = await generateProcessSpecification(auth, {
      actionConfiguration: action,
    });
  } else {
    ((a: never) => {
      throw new Error(`Unexpected action type: ${a}`);
    })(action);
  }

  if (specRes.isErr()) {
    logger.error(
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        elapsed: Date.now() - now,
        error: specRes.error,
      },
      "Error generating action specification"
    );
    yield {
      type: "agent_error",
      created: now,
      configurationId: configuration.sId,
      messageId: agentMessage.sId,
      error: {
        code: "parameters_generation_error",
        message: `Error generating action specification: ${specRes.error.message}`,
      },
    };
    return;
  }

  let rawInputs: Record<string, string | boolean | number> = {};

  if (specRes.value.inputs.length > 0) {
    const rawInputsRes = await generateActionInputs(
      auth,
      configuration,
      specRes.value,

      conversation,
      userMessage
    );

    if (rawInputsRes.isErr()) {
      logger.error(
        {
          workspaceId: conversation.owner.sId,
          conversationId: conversation.sId,
          elapsed: Date.now() - now,
          error: rawInputsRes.error,
        },
        "Error generating action inputs"
      );
      yield {
        type: "agent_error",
        created: now,
        configurationId: configuration.sId,
        messageId: agentMessage.sId,
        error: {
          code: "parameters_generation_error",
          message: `Error generating action parameters: ${rawInputsRes.error.message}`,
        },
      };
      return;
    }
    logger.info(
      {
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        elapsed: Date.now() - now,
      },
      "[ASSISTANT_TRACE] Action inputs generation"
    );

    rawInputs = rawInputsRes.value;
  }

  if (isRetrievalConfiguration(action)) {
    const eventStream = runRetrieval(auth, {
      configuration,
      actionConfiguration: action,
      conversation,
      agentMessage,
      rawInputs,
    });

    for await (const event of eventStream) {
      switch (event.type) {
        case "retrieval_params":
          yield event;
          break;
        case "retrieval_error":
          yield {
            type: "agent_error",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
            },
          };
          return;
        case "retrieval_success":
          yield {
            type: "agent_action_success",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            action: event.action,
          };

          // We stitch the action into the agent message. The conversation is expected to include
          // the agentMessage object, updating this object will update the conversation as well.
          agentMessage.action = event.action;
          break;

        default:
          assertNever(event);
      }
    }
  } else if (isDustAppRunConfiguration(action)) {
    const eventStream = runDustApp(auth, {
      configuration,
      actionConfiguration: action,
      conversation,
      agentMessage,
      spec: specRes.value,
      rawInputs,
    });

    for await (const event of eventStream) {
      switch (event.type) {
        case "dust_app_run_params":
          yield event;
          break;
        case "dust_app_run_error":
          yield {
            type: "agent_error",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
            },
          };
          return;
        case "dust_app_run_block":
          yield event;
          break;
        case "dust_app_run_success":
          yield {
            type: "agent_action_success",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            action: event.action,
          };

          // We stitch the action into the agent message. The conversation is expected to include
          // the agentMessage object, updating this object will update the conversation as well.
          agentMessage.action = event.action;
          break;

        default:
          assertNever(event);
      }
    }
  } else if (isTablesQueryConfiguration(action)) {
    const eventStream = runTablesQuery(auth, {
      configuration,
      actionConfiguration: action,
      conversation,
      agentMessage,
      rawInputs,
    });

    for await (const event of eventStream) {
      switch (event.type) {
        case "tables_query_params":
        case "tables_query_output":
          yield event;
          break;
        case "tables_query_error":
          yield {
            type: "agent_error",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
            },
          };
          return;
        case "tables_query_success":
          yield {
            type: "agent_action_success",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            action: event.action,
          };

          // We stitch the action into the agent message. The conversation is expected to include
          // the agentMessage object, updating this object will update the conversation as well.
          agentMessage.action = event.action;
          break;
        default:
          assertNever(event);
      }
    }
  } else if (isProcessConfiguration(action)) {
    const eventStream = runProcess(auth, {
      configuration,
      actionConfiguration: action,
      conversation,
      userMessage,
      agentMessage,
      rawInputs,
    });

    for await (const event of eventStream) {
      switch (event.type) {
        case "process_params":
          yield event;
          break;
        case "process_error":
          yield {
            type: "agent_error",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            error: {
              code: event.error.code,
              message: event.error.message,
            },
          };
          return;
        case "process_success":
          yield {
            type: "agent_action_success",
            created: event.created,
            configurationId: configuration.sId,
            messageId: agentMessage.sId,
            action: event.action,
          };

          // We stitch the action into the agent message. The conversation is expected to include
          // the agentMessage object, updating this object will update the conversation as well.
          agentMessage.action = event.action;
          break;

        default:
          assertNever(event);
      }
    }
  } else {
    assertNever(action);
  }
}
