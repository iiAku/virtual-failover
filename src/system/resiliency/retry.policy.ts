import {
  ConstantBackoff,
  ExponentialBackoff,
  handleAll,
  retry,
} from "cockatiel";

export const retryPolicy = retry(handleAll, {
  maxAttempts: 3,
  backoff: new ConstantBackoff(50),
});
