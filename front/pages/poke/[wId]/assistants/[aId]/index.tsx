import { ContextItem, Page } from "@dust-tt/sparkle";
import type { AgentConfigurationType } from "@dust-tt/types";
import {
  isDustAppRunConfiguration,
  isRetrievalConfiguration,
  isTablesQueryConfiguration,
} from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";

export const getServerSideProps = withSuperUserAuthRequirements<{
  agentConfigurations: AgentConfigurationType[];
}>(async (context, auth) => {
  const aId = context.params?.aId;
  if (!aId || typeof aId !== "string") {
    return {
      notFound: true,
    };
  }

  const agentConfigurations = await getAgentConfigurations({
    auth,
    agentsGetView: { agentId: aId, allVersions: true },
    variant: "full",
  });

  return {
    props: {
      agentConfigurations,
    },
  };
});

const DataSourcePage = ({
  agentConfigurations,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      <div className="mx-auto max-w-4xl pt-8">
        <Page.Vertical align="stretch">
          <ContextItem.List>
            {agentConfigurations.map((a) => (
              <ContextItem
                key={a.version}
                title={`@${a.name} (${a.sId}) v${a.version}`}
                visual={<></>}
              >
                <ContextItem.Description>
                  <div className="flex flex-col gap-2">
                    <div className="ml-4 pt-2 text-sm text-element-700">
                      <div>createdAt: {`${a.versionCreatedAt}`}</div>
                      <div>
                        scope: <b>{a.scope}</b>
                      </div>
                      <div>versionAuthorId: {a.versionAuthorId}</div>
                    </div>
                    <div className="ml-4 text-sm text-element-700">
                      <div className="font-bold">Instructions:</div>
                      {a.instructions}
                    </div>
                    <div className="ml-4 text-sm text-element-700">
                      <div className="font-bold">model:</div>
                      {JSON.stringify(a.generation?.model, null, 2)}
                    </div>
                    {a.actions.map((action, index) =>
                      isRetrievalConfiguration(action) ? (
                        <div
                          className="mb-2 ml-4 flex-col text-sm text-gray-600"
                          key={`action-${index}`}
                        >
                          <div className="font-bold">Data Sources:</div>
                          {JSON.stringify(action.dataSources, null, 2)}
                        </div>
                      ) : isDustAppRunConfiguration(action) ? (
                        <div
                          className="mb-2 ml-4 flex-col text-sm text-gray-600"
                          key={`action-${index}`}
                        >
                          <div className="font-bold">Dust app:</div>
                          <div>
                            {action.appWorkspaceId}/{action.appId}
                          </div>
                        </div>
                      ) : isTablesQueryConfiguration(action) ? (
                        <div
                          className="mb-2 ml-4 flex-col text-sm text-gray-600"
                          key={`action-${index}`}
                        >
                          <div className="font-bold">Tables:</div>
                          {action.tables.map((t) => (
                            <div
                              key={`${t.workspaceId}/${t.dataSourceId}/${t.tableId}`}
                            >
                              {t.workspaceId}/{t.dataSourceId}/{t.tableId}
                            </div>
                          ))}
                        </div>
                      ) : null
                    )}
                  </div>
                </ContextItem.Description>
              </ContextItem>
            ))}
          </ContextItem.List>
        </Page.Vertical>
      </div>
    </div>
  );
};

export default DataSourcePage;
