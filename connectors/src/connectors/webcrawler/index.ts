import type {
  ContentNode,
  ModelId,
  Result,
  WebCrawlerConfigurationType,
} from "@dust-tt/types";
import {
  DepthOptions,
  Err,
  isDepthOption,
  Ok,
  WEBCRAWLER_MAX_PAGES,
  WebCrawlerHeaderRedactedValue,
} from "@dust-tt/types";

import {
  getDisplayNameForPage,
  normalizeFolderUrl,
  stableIdForUrl,
} from "@connectors/connectors/webcrawler/lib/utils";
import {
  WebCrawlerFolder,
  WebCrawlerPage,
} from "@connectors/lib/models/webcrawler";
import logger from "@connectors/logger/logger";
import { ConnectorResource } from "@connectors/resources/connector_resource";
import { WebCrawlerConfigurationResource } from "@connectors/resources/webcrawler_resource";
import type { DataSourceConfig } from "@connectors/types/data_source_config.js";

import type { ConnectorPermissionRetriever } from "../interface";
import {
  launchCrawlWebsiteWorkflow,
  stopCrawlWebsiteWorkflow,
} from "./temporal/client";

export async function createWebcrawlerConnector(
  dataSourceConfig: DataSourceConfig,
  connectionId: string,
  configuration: WebCrawlerConfigurationType
): Promise<Result<string, Error>> {
  if (!configuration) {
    throw new Error("Configuration is required");
  }
  const depth = configuration.depth;
  if (!isDepthOption(depth)) {
    return new Err(new Error("Invalid depth option"));
  }
  if (configuration.maxPageToCrawl > WEBCRAWLER_MAX_PAGES) {
    return new Err(
      new Error(`Maximum value for Max Page is ${WEBCRAWLER_MAX_PAGES}`)
    );
  }
  const url = configuration.url.trim();
  const webCrawlerConfigurationBlob = {
    url,
    maxPageToCrawl: configuration.maxPageToCrawl,
    crawlMode: configuration.crawlMode,
    depth: depth,
    crawlFrequency: configuration.crawlFrequency,
    lastCrawledAt: null,
    headers: configuration.headers,
  };

  const connector = await ConnectorResource.makeNew(
    "webcrawler",
    {
      connectionId: configuration.url,
      workspaceAPIKey: dataSourceConfig.workspaceAPIKey,
      workspaceId: dataSourceConfig.workspaceId,
      dataSourceName: dataSourceConfig.dataSourceName,
    },
    webCrawlerConfigurationBlob
  );

  const workflowRes = await launchCrawlWebsiteWorkflow(connector.id);
  if (workflowRes.isErr()) {
    return workflowRes;
  }
  logger.info(
    { connectorId: connector.id },
    `Launched crawl website workflow for connector`
  );

  return new Ok(connector.id.toString());
}

export async function retrieveWebcrawlerConnectorPermissions({
  connectorId,
  parentInternalId,
}: Parameters<ConnectorPermissionRetriever>[0]): Promise<
  Result<ContentNode[], Error>
> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error("Connector not found"));
  }

  const webCrawlerConfig =
    await WebCrawlerConfigurationResource.fetchByConnectorId(connector.id);

  if (!webCrawlerConfig) {
    return new Err(new Error("Webcrawler configuration not found"));
  }
  let parentUrl: string | null = null;
  if (parentInternalId) {
    const parent = await WebCrawlerFolder.findOne({
      where: {
        connectorId: connector.id,
        webcrawlerConfigurationId: webCrawlerConfig.id,
        internalId: parentInternalId,
      },
    });
    if (!parent) {
      return new Err(new Error("Parent not found"));
    }
    parentUrl = parent.url;
  }

  const pages = await WebCrawlerPage.findAll({
    where: {
      connectorId: connector.id,
      webcrawlerConfigurationId: webCrawlerConfig.id,
      parentUrl: parentUrl,
    },
  });

  const folders = await WebCrawlerFolder.findAll({
    where: {
      connectorId: connector.id,
      webcrawlerConfigurationId: webCrawlerConfig.id,
      parentUrl: parentUrl,
    },
  });

  const normalizedPagesSet = new Set(
    pages.map((p) => normalizeFolderUrl(p.url))
  );
  // List of folders that are also pages
  const excludedFoldersSet = new Set(
    folders.map((f) => f.url).filter((f) => normalizedPagesSet.has(f))
  );

  return new Ok(
    folders
      // We don't want to show folders that are also pages.
      .filter((f) => !excludedFoldersSet.has(f.url))
      .map((folder): ContentNode => {
        return {
          provider: "webcrawler",
          internalId: folder.internalId,
          parentInternalId: folder.parentUrl
            ? stableIdForUrl({
                url: folder.parentUrl,
                ressourceType: "folder",
              })
            : null,
          title:
            new URL(folder.url).pathname
              .split("/")
              .filter((x) => x)
              .pop() || folder.url,
          sourceUrl: null,
          expandable: true,
          permission: "read",
          dustDocumentId: null,
          type: "folder",
          lastUpdatedAt: folder.updatedAt.getTime(),
        };
      })
      .concat(
        pages.map((page): ContentNode => {
          const isFileAndFolder = excludedFoldersSet.has(
            normalizeFolderUrl(page.url)
          );
          return {
            provider: "webcrawler",
            internalId: isFileAndFolder
              ? stableIdForUrl({
                  url: normalizeFolderUrl(page.url),
                  ressourceType: "folder",
                })
              : page.documentId,
            parentInternalId: page.parentUrl
              ? stableIdForUrl({
                  url: page.parentUrl,
                  ressourceType: "folder",
                })
              : null,
            title: getDisplayNameForPage(page.url),
            sourceUrl: page.url,
            expandable: isFileAndFolder ? true : false,
            permission: "read",
            dustDocumentId: page.documentId,
            type: "file",
            lastUpdatedAt: page.updatedAt.getTime(),
          };
        })
      )
      .sort((a, b) => a.title.localeCompare(b.title))
  );
}

export async function stopWebcrawlerConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  const res = await stopCrawlWebsiteWorkflow(connectorId);
  if (res.isErr()) {
    return res;
  }

  return new Ok(undefined);
}

export async function pauseWebcrawlerConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Connector not found.");
  }
  await connector.markAsPaused();
  const stopRes = await stopCrawlWebsiteWorkflow(connectorId);
  if (stopRes.isErr()) {
    return stopRes;
  }
  return new Ok(undefined);
}

export async function unpauseWebcrawlerConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Connector not found.");
  }
  await connector.markAsUnpaused();
  const startRes = await launchCrawlWebsiteWorkflow(connectorId);
  if (startRes.isErr()) {
    return startRes;
  }
  return new Ok(undefined);
}

export async function cleanupWebcrawlerConnector(
  connectorId: ModelId
): Promise<Result<undefined, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Connector not found.");
  }

  const res = await connector.delete();
  if (res.isErr()) {
    logger.error(
      { connectorId, error: res.error },
      "Error cleaning up Webcrawler connector."
    );
    return res;
  }

  return new Ok(undefined);
}

export async function retrieveWebCrawlerContentNodes(
  connectorId: ModelId,
  internalIds: string[]
): Promise<Result<ContentNode[], Error>> {
  const nodes: ContentNode[] = [];

  const [folders, pages] = await Promise.all([
    WebCrawlerFolder.findAll({
      where: {
        connectorId: connectorId,
        url: internalIds,
      },
    }),
    WebCrawlerPage.findAll({
      where: {
        connectorId: connectorId,
        documentId: internalIds,
      },
    }),
  ]);

  folders.forEach((folder) => {
    nodes.push({
      provider: "webcrawler",
      internalId: folder.internalId,
      parentInternalId: folder.parentUrl,
      title: folder.url,
      sourceUrl: folder.url,
      expandable: true,
      permission: "read",
      dustDocumentId: null,
      type: "folder",
      lastUpdatedAt: folder.updatedAt.getTime(),
    });
  });
  pages.forEach((page) => {
    nodes.push({
      provider: "webcrawler",
      internalId: page.documentId,
      parentInternalId: page.parentUrl,
      title: page.title ?? page.url,
      sourceUrl: page.url,
      expandable: false,
      permission: "read",
      dustDocumentId: page.documentId,
      type: "file",
      lastUpdatedAt: page.updatedAt.getTime(),
    });
  });

  return new Ok(nodes);
}

export async function retrieveWebCrawlerContentNodeParents(
  connectorId: ModelId,
  internalId: string
): Promise<Result<string[], Error>> {
  const parents: string[] = [];
  let parentUrl: string | null = null;

  // First we get the Page or Folder for which we want to retrieve the parents
  const page = await WebCrawlerPage.findOne({
    where: {
      connectorId: connectorId,
      documentId: internalId,
    },
  });
  if (page && page.parentUrl) {
    parentUrl = page.parentUrl;
  } else {
    const folder = await WebCrawlerFolder.findOne({
      where: {
        connectorId: connectorId,
        internalId: internalId,
      },
    });
    if (folder && folder.parentUrl) {
      parentUrl = folder.parentUrl;
    }
  }

  // If the Page or Folder has no parentUrl, we return an empty array
  if (!parentUrl) {
    return new Ok([]);
  }

  // Otherwise we loop on the parentUrl to retrieve all the parents
  const visitedUrls = new Set<string>();
  while (parentUrl) {
    const parentFolder: WebCrawlerFolder | null =
      await WebCrawlerFolder.findOne({
        where: {
          connectorId: connectorId,
          url: parentUrl,
        },
      });

    if (!parentFolder) {
      parentUrl = null;
      continue;
    }

    if (visitedUrls.has(parentFolder.url)) {
      logger.error(
        {
          connectorId,
          internalId,
          parents,
        },
        "Found a cycle in the parents tree"
      );
      parentUrl = null;
      continue;
    }
    parents.push(parentFolder.internalId);
    visitedUrls.add(parentFolder.url);
    parentUrl = parentFolder.parentUrl;
  }

  return new Ok(parents);
}

export async function setWebcrawlerConfiguration(
  connectorId: ModelId,
  configuration: WebCrawlerConfigurationType
): Promise<Result<void, Error>> {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    return new Err(new Error("Connector not found"));
  }
  const depth = configuration.depth;
  if (!isDepthOption(depth)) {
    return new Err(
      new Error(
        `Invalid depth option. Expected one of: (${DepthOptions.join(",")})`
      )
    );
  }

  if (configuration.maxPageToCrawl > WEBCRAWLER_MAX_PAGES) {
    return new Err(
      new Error(`Maximum value for Max Page is ${WEBCRAWLER_MAX_PAGES}`)
    );
  }
  const webcrawlerConfig =
    await WebCrawlerConfigurationResource.fetchByConnectorId(connector.id);

  if (!webcrawlerConfig) {
    return new Err(
      new Error(`Webcrawler configuration not found for ${connectorId}`)
    );
  }

  await webcrawlerConfig.update({
    url: configuration.url,
    maxPageToCrawl: configuration.maxPageToCrawl,
    crawlMode: configuration.crawlMode,
    depth: depth,
    crawlFrequency: configuration.crawlFrequency,
  });
  const existingHeaders = await webcrawlerConfig.getCustomHeaders();
  const headersForUpdate: Record<string, string> = {};
  for (const [key, value] of Object.entries(configuration.headers)) {
    if (value !== WebCrawlerHeaderRedactedValue) {
      // If the value is not redacted, we use the new value.
      headersForUpdate[key] = value;
    } else {
      // If the value is redacted, we use the existing value from
      // the database.
      const existingValue = existingHeaders[key];
      if (existingValue) {
        headersForUpdate[key] = existingValue;
      }
    }
  }

  await webcrawlerConfig.setCustomHeaders(headersForUpdate);

  const stopRes = await stopCrawlWebsiteWorkflow(connector.id);
  if (stopRes.isErr()) {
    return new Err(stopRes.error);
  }
  const startRes = await launchCrawlWebsiteWorkflow(connector.id);
  if (startRes.isErr()) {
    return new Err(startRes.error);
  }

  return new Ok(undefined);
}
