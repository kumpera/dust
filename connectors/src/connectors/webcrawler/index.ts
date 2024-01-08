import { ConnectorResource, ModelId } from "@dust-tt/types";

import { Connector, sequelize_conn } from "@connectors/lib/models";
import {
  WebCrawlerConfiguration,
  WebCrawlerFolder,
} from "@connectors/lib/models/webcrawler";
import { Err, Ok, type Result } from "@connectors/lib/result.js";
import logger from "@connectors/logger/logger";
import type { DataSourceConfig } from "@connectors/types/data_source_config.js";

import { ConnectorPermissionRetriever } from "../interface";
import {
  launchCrawlWebsiteWorkflow,
  stopCrawlWebsiteWorkflow,
} from "./temporal/client";

export async function createWebcrawlerConnector(
  dataSourceConfig: DataSourceConfig,
  url: string
): Promise<Result<string, Error>> {
  const res = await sequelize_conn.transaction(
    async (t): Promise<Result<Connector, Error>> => {
      const connector = await Connector.create(
        {
          type: "webcrawler",
          connectionId: url,
          workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
          workspaceId: dataSourceConfig.workspaceId,
          dataSourceName: dataSourceConfig.dataSourceName,
        },
        { transaction: t }
      );

      await WebCrawlerConfiguration.create(
        {
          connectorId: connector.id,
          url,
        },
        {
          transaction: t,
        }
      );

      return new Ok(connector);
    }
  );

  if (res.isErr()) {
    return res;
  }

  const workflowRes = await launchCrawlWebsiteWorkflow(res.value.id);
  if (workflowRes.isErr()) {
    return workflowRes;
  }
  logger.info(
    { connectorId: res.value.id },
    `Launched crawl website workflow for connector`
  );

  return new Ok(res.value.id.toString());
}

export async function retrieveWebcrawlerConnectorPermissions({
  connectorId,
  parentInternalId,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ConnectorResource[], Error>
> {
  const connector = await Connector.findByPk(connectorId);
  if (!connector) {
    return new Err(new Error("Connector not found"));
  }

  const webCrawlerConfig = await WebCrawlerConfiguration.findOne({
    where: { connectorId: connector.id },
  });
  if (!webCrawlerConfig) {
    return new Err(new Error("Webcrawler configuration not found"));
  }
  let parentUrl: string | null = null;
  if (parentInternalId) {
    const parent = await WebCrawlerFolder.findOne({
      where: {
        connectorId: connector.id,
        webcrawlerConfigurationId: webCrawlerConfig.id,
        id: parseInt(parentInternalId),
      },
    });
    if (!parent) {
      return new Err(new Error("Parent not found"));
    }
    parentUrl = parent.url;
  }

  const folders = await WebCrawlerFolder.findAll({
    where: {
      connectorId: connector.id,
      webcrawlerConfigurationId: webCrawlerConfig.id,
      parentUrl: parentUrl,
    },
  });

  return new Ok(
    folders
      .map((folder): ConnectorResource => {
        return {
          provider: "webcrawler",
          internalId: folder.id.toString(),
          parentInternalId: folder.parentUrl,
          type: folder.ressourceType,
          title:
            new URL(folder.url).pathname
              .split("/")
              .filter((x) => x)
              .pop() || folder.url,
          sourceUrl: folder.ressourceType === "file" ? folder.url : null,
          expandable: folder.ressourceType === "folder",
          permission: "read",
          dustDocumentId: folder.dustDocumentId,
          lastUpdatedAt: folder.updatedAt.getTime(),
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title))
  );
}

export async function stopWebcrawlerConnector(
  connectorId: string
): Promise<Result<string, Error>> {
  const res = await stopCrawlWebsiteWorkflow(parseInt(connectorId));
  if (res.isErr()) {
    return res;
  }

  return new Ok(connectorId);
}

export async function cleanupWebcrawlerConnector(
  connectorId: string
): Promise<Result<void, Error>> {
  return sequelize_conn.transaction(async (transaction) => {
    await WebCrawlerFolder.destroy({
      where: {
        connectorId: connectorId,
      },
      transaction,
    });
    await WebCrawlerConfiguration.destroy({
      where: {
        connectorId: connectorId,
      },
      transaction,
    });
    await Connector.destroy({
      where: {
        id: connectorId,
      },
      transaction,
    });
    return new Ok(undefined);
  });
}

export async function retrieveWebCrawlerObjectsTitles(
  connectorId: ModelId,
  internalIds: string[]
): Promise<Result<Record<string, string>, Error>> {
  const googleDriveFiles = await WebCrawlerFolder.findAll({
    where: {
      connectorId: connectorId,
      url: internalIds,
    },
  });

  const titles = googleDriveFiles.reduce((acc, curr) => {
    acc[curr.url] = curr.url;
    return acc;
  }, {} as Record<string, string>);

  return new Ok(titles);
}

export async function retrieveWebCrawlerObjectsParents(
  connectorId: ModelId,
  internalId: string
): Promise<Result<string[], Error>> {
  const parents: string[] = [internalId];
  let ptr = internalId;

  const visited = new Set<string>();

  do {
    const folder = await WebCrawlerFolder.findOne({
      where: {
        connectorId: connectorId,
        url: ptr,
      },
    });
    if (!folder || !folder.parentUrl) {
      return new Ok(parents);
    }

    if (visited.has(folder.parentUrl)) {
      logger.error(
        {
          connectorId,
          internalId,
          parents,
        },
        "Found a cycle in the parents tree"
      );
      return new Ok(parents);
    }
    parents.push(folder.parentUrl);
    ptr = folder.parentUrl;
    visited.add(ptr);
  } while (ptr);

  return new Ok(parents);
}
