import { CrudConfigService } from "@dataui/crud";

/**
 * Must load BEFORE AppModule is imported (decorators evaluate at import time).
 * See https://gid-oss.github.io/dataui-nestjs-crud/controllers/#global-options
 */
CrudConfigService.load({
  query: {
    limit: 25,
    maxLimit: 200,
    cache: 0,
    alwaysPaginate: false,
  },
  params: {
    id: {
      field: "id",
      type: "string",
      primary: true,
    },
  },
  routes: {
    exclude: [],
  },
});
