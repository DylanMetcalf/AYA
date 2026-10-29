import { beforeEach } from "vitest";
import { resetDb } from "./helpers";

beforeEach(async () => {
  await resetDb();
});
