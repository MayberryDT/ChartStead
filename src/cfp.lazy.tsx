import { createLazyRoute } from "@tanstack/react-router";

import { CfpPage } from "./CfpPage";

export const Route = createLazyRoute("/e/$eventId/cfp")({
  component: CfpPage,
});
