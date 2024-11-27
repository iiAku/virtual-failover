import { MONITORING_URL } from "../src/app.config";

/*
 * What would be cool is to use the exact same command we have in the code
 * as the fetch with method HEAD does not get exactly the same feedback
 * as the code does while using curl
 * */
describe("Host", () => {
  test.each(MONITORING_URL)(
    "%p.url - Should respond to head request",
    async (url) => {
      const response = await fetch(url, { method: "HEAD" });
      expect(response.status).toBe(200);
    },
  );
});
