import { dustManagedCredentials } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import { Sequelize } from "sequelize";

import { DataSource } from "@app/lib/models/data_source";
import logger from "@app/logger/logger";

const { CONNECTORS_DB = "" } = process.env;

async function main() {
  // get all gdrive data sources
  // - for each ds:
  //    - delete all gridve files in conn db
  //    - delete datasource in core
  //    - create datasource in core
  const connectors_sequelize = new Sequelize(CONNECTORS_DB, {
    logging: false,
  });

  console.log("fetching gdrive data sources");
  const ds = await DataSource.findAll({
    where: {
      connectorProvider: "google_drive",
    },
  });
  console.log(`found ${ds.length} gdrive data sources`);

  for (const d of ds) {
    console.log(`processing ${d.name}`);
    const connectorId = d.connectorId;
    console.log(
      `deleting google_drive_files files from connectors db for connector ${connectorId}`
    );
    await connectors_sequelize.query(
      `DELETE FROM google_drive_files WHERE "connectorId" = ${connectorId}`
    );
    console.log(`deleting data source ${d.name} from core`);
    const coreAPI = new CoreAPI(logger);
    await coreAPI.deleteDataSource({
      projectId: d.dustAPIProjectId,
      dataSourceName: d.name,
    });
    console.log(`creating data source ${d.name} in core`);
    await coreAPI.createDataSource({
      projectId: d.dustAPIProjectId,
      dataSourceId: d.name,
      config: {
        provider_id: "openai",
        model_id: "text-embedding-ada-002",
        splitter_id: "base_v0",
        max_chunk_size: 256,
        qdrant_config: null,
      },
      credentials: dustManagedCredentials(),
    });
  }
}

main()
  .then(() => {
    console.log("done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
