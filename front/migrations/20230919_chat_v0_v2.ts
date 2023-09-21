import parseArgs from "minimist";
import { QueryTypes } from "sequelize";

import { front_sequelize } from "@app/lib/databases";
import {
  AgentRetrievalAction,
  ChatMessage,
  ChatRetrievedDocument,
  ChatSession,
  RetrievalDocument,
  User,
  Workspace,
} from "@app/lib/models";
import {
  AgentMessage,
  Conversation,
  ConversationParticipant,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import { redisClient } from "@app/lib/redis";
import { new_id } from "@app/lib/utils";

// Migrate all the conversations of a given workspace
async function _migrateWorkspace(workspaceId: string) {
  console.log("Migrating workspace", workspaceId);
  const workspace = await Workspace.findOne({
    where: {
      sId: workspaceId,
    },
  });
  if (!workspace) {
    throw new Error(`Workspace ${workspaceId} not found`);
  }
  const oldChatSessions = await ChatSession.findAll({
    where: {
      workspaceId: workspace.id,
    },
  });
  for (const oldChatSession of oldChatSessions) {
    // iterate on all old chat sessions
    const transactionRes = await front_sequelize.transaction(async (t) => {
      // One transaction / conversation (including all children messages, retrieval, actions etc)

      // Conversation will be dedup based on Conversation.sId, which is unique in the DB
      const [newConversation] = await Conversation.upsert(
        {
          createdAt: oldChatSession.createdAt,
          updatedAt: oldChatSession.updatedAt,
          sId: oldChatSession.sId,
          title: oldChatSession.title,
          visibility:
            oldChatSession.visibility == "workspace" ? "workspace" : "unlisted",
          workspaceId: oldChatSession.workspaceId,
        },
        {
          transaction: t,
        }
      );

      if (oldChatSession.userId) {
        // dedup on (conversationId, userId)
        await ConversationParticipant.upsert(
          {
            createdAt: oldChatSession.createdAt,
            updatedAt: oldChatSession.updatedAt,
            conversationId: newConversation.id,
            userId: oldChatSession.userId,
            action: "posted",
          },
          {
            transaction: t,
          }
        );
      }

      const oldMessages = await ChatMessage.findAll({
        where: {
          chatSessionId: oldChatSession.id,
        },
        order: [["id", "ASC"]],
        transaction: t,
      });

      let previousMessage: Message | null = null;
      let rank = 0;
      for (const oldMessage of oldMessages) {
        const user = oldChatSession.userId
          ? await User.findByPk(oldChatSession.userId, {
              transaction: t,
            })
          : null;
        let newUserMessage: UserMessage | null = null;
        let newAgentMessage: AgentMessage | null = null;

        switch (oldMessage.role) {
          case "user": {
            // Dedup already migrated UserMessage based on conversation.id, createdAt, updatedAt and content.
            const existingMessage: { id: number }[] =
              await front_sequelize.query(
                `
            SELECT um.id FROM user_messages um
            INNER JOIN messages m ON m."userMessageId" = um.id
            WHERE m."conversationId" = :conversation_id
            and um."createdAt" = :createdAt
            and um."updatedAt" = :updatedAt
            and um."content" = :content
            `,
                {
                  replacements: {
                    conversation_id: newConversation.id,
                    createdAt: oldMessage.createdAt,
                    updatedAt: oldMessage.updatedAt,
                    content: oldMessage.message || "",
                  },
                  type: QueryTypes.SELECT,
                }
              );
            if (existingMessage.length > 1) {
              throw new Error(
                `Found more than one matching message for conversation ${newConversation.id}`
              );
            }
            // dedup UserMessage based on it's primary key
            const upsertRes = await UserMessage.upsert(
              {
                id:
                  existingMessage.length > 0
                    ? existingMessage[0].id
                    : undefined,
                createdAt: oldMessage.createdAt,
                updatedAt: oldMessage.updatedAt,
                content: oldMessage.message || "",
                userContextUsername: user?.username || "",
                userContextTimezone: "Europe/Paris", // Looks like we don't have any timezone in the DB today. TBD at code review time.
                userContextEmail: user?.email || null,
                userContextFullName: user?.name || null,
                userContextProfilePictureUrl: null, // looks like we don't store the user profile pictures today. TBD at code review time.
                userId: user?.id || null,
              },
              {
                transaction: t,
              }
            );

            newUserMessage = upsertRes[0];
            break;
          }
          case "assistant":
            {
              const existingMessage: { id: number }[] =
                await front_sequelize.query(
                  `
        SELECT am.id FROM agent_messages am
        INNER JOIN messages m ON m."agentMessageId" = am.id
        WHERE m."conversationId" = :conversation_id
        and am."createdAt" = :createdAt
        and am."updatedAt" = :updatedAt
        and am."content" = :content
        `,
                  {
                    replacements: {
                      conversation_id: newConversation.id,
                      createdAt: oldMessage.createdAt,
                      updatedAt: oldMessage.updatedAt,
                      content: oldMessage.message || "",
                    },
                    type: QueryTypes.SELECT,
                  }
                );
              if (existingMessage.length > 1) {
                throw new Error(
                  `Found more than one matching message for conversation ${newConversation.id}`
                );
              }
              // dedup based on it's primary key
              const upserRes = await AgentMessage.upsert(
                {
                  id:
                    existingMessage.length > 0
                      ? existingMessage[0].id
                      : undefined,
                  createdAt: oldMessage.createdAt,
                  updatedAt: oldMessage.updatedAt,
                  status: "succeeded",
                  content: oldMessage.message,
                  agentConfigurationId: "dust",
                  agentConfigurationVersion: 0,
                },
                {
                  transaction: t,
                }
              );

              newAgentMessage = upserRes[0];

              const { chatRetrievedDocuments, retrievalMessage } =
                await getRetrievalForOldMessage(oldMessage);
              if (retrievalMessage && !newAgentMessage.agentRetrievalActionId) {
                // if we already have a agentRetrievalActionId, we don't re-migrate the retrieval as they are hard to dedup
                const agentRetrievalAction = await AgentRetrievalAction.upsert(
                  {
                    id: newAgentMessage.agentRetrievalActionId || undefined,
                    createdAt: retrievalMessage.createdAt,
                    updatedAt: retrievalMessage.updatedAt,
                    topK: 16,
                    retrievalConfigurationId: "dust-action",
                  },
                  {
                    transaction: t,
                  }
                );

                await newAgentMessage.update(
                  {
                    agentRetrievalActionId: agentRetrievalAction[0].id,
                  },
                  {
                    transaction: t,
                  }
                );
                for (const chatRetrievedDocument of chatRetrievedDocuments) {
                  await RetrievalDocument.upsert(
                    {
                      createdAt: chatRetrievedDocument.createdAt,
                      updatedAt: chatRetrievedDocument.updatedAt,
                      dataSourceId: chatRetrievedDocument.dataSourceId,
                      sourceUrl: chatRetrievedDocument.sourceUrl,
                      documentId: chatRetrievedDocument.documentId,
                      reference: new_id().slice(0, 2),
                      timestamp: new Date(
                        chatRetrievedDocument.timestamp
                      ).getTime(),
                      tags: chatRetrievedDocument.tags,
                      score: chatRetrievedDocument.score,
                      retrievalActionId: agentRetrievalAction[0].id,
                    },
                    {
                      transaction: t,
                    }
                  );
                }
              }
            }
            break;
          case "retrieval":
            break;
          case "error":
            break;

          default:
            ((e: never) => {
              throw new Error(`Unknown role ${e}`);
            })(oldMessage.role);
        }

        if (["user", "assistant"].includes(oldMessage.role)) {
          const [newMessage] = (await Message.upsert(
            {
              sId: oldMessage.sId,
              createdAt: oldMessage.createdAt,
              updatedAt: oldMessage.updatedAt,
              version: 0,
              rank: rank++,
              visibility: "visible",
              parentId: previousMessage?.id || null,
              userMessageId: newUserMessage?.id || null,
              agentMessageId: newAgentMessage?.id || null,
              conversationId: newConversation.id,
            },
            {
              transaction: t,
            }
          )) as [Message, boolean | null];
          if (newMessage.userMessageId) {
            previousMessage = newMessage;
          }
          newUserMessage = null;
          newAgentMessage = null;
        }
      }

      return newConversation.id;
    });

    console.log(
      `Done migrating worksapce ${workspaceId} chat session ${oldChatSession.id} to conversation ${transactionRes}`
    );
  }
}

// Locking on the workspace id before migrating it, because running two migration in parrallel
// would result in a very messy situation.
async function migrateWorkspaceSafe(workspaceId: string) {
  const redis = await redisClient();
  const lockKey = `migrate_conversation_${workspaceId}`;
  try {
    const val = await redis.incr(lockKey);
    if (val > 1) {
      console.error(`Already migrating workspace ${workspaceId}`);
      return;
    }
    await _migrateWorkspace(workspaceId);
  } finally {
    const val = await redis.decr(lockKey);
    if (val < 0) {
      console.error(
        "Lock value is negative, this should not happen so be careful before running another migration"
      );
    }
    await redis.quit();
  }
}

async function getRetrievalForOldMessage(oldChatMessage: ChatMessage): Promise<{
  chatRetrievedDocuments: ChatRetrievedDocument[];
  retrievalMessage: ChatMessage | null;
}> {
  const oldMessages = await ChatMessage.findAll({
    where: {
      chatSessionId: oldChatMessage.chatSessionId,
    },
    order: [["id", "ASC"]],
  });
  let i = 0;
  for (const oldMessage of oldMessages) {
    if (oldMessage.id === oldChatMessage.id) {
      break;
    }
    i++;
  }
  if (i > 0) {
    if (oldMessages[i - 1].role === "retrieval") {
      return {
        chatRetrievedDocuments: await ChatRetrievedDocument.findAll({
          where: {
            chatMessageId: oldMessages[i - 1].id,
          },
          order: [["id", "ASC"]],
        }),
        retrievalMessage: oldMessages[i - 1],
      };
    }
  }

  return { chatRetrievedDocuments: [], retrievalMessage: null };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!LIVE) {
    console.log("Not running in live mode, skipping");
    return;
  }
  const workspaces = await Workspace.findAll(
    args.wId ? { where: { sId: args.wId } } : {}
  );
  for (const workspace of workspaces) {
    await migrateWorkspaceSafe(workspace.sId);
  }
}

const { LIVE = false } = process.env;
main().catch(console.error);
