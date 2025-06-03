import { ConstantBackoff, handleAll, retry } from "cockatiel";

export const MAX_RETRIES = 3;

export const retryPolicy = retry(handleAll, {
  maxAttempts: MAX_RETRIES,
  backoff: new ConstantBackoff(50),
});
