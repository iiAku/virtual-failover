import {
  ConstantBackoff,
  ExponentialBackoff,
  handleAll,
  retry,
} from "cockatiel";

export const MAX_RETRIES = 2;

export const retryPolicy = retry(handleAll, {
  maxAttempts: MAX_RETRIES,
  backoff: new ConstantBackoff(50),
});
