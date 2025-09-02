// Result<T> pattern for better error handling
export type Result<T> = Success<T> | Failure;

export interface Success<T> {
  success: true;
  value: T;
}

export interface Failure {
  success: false;
  error: string;
  details?: any;
}

export class ResultUtils {
  static ok<T>(value: T): Success<T> {
    return { success: true, value };
  }

  static fail(error: string, details?: any): Failure {
    return { success: false, error, details };
  }

  static isSuccess<T>(result: Result<T>): result is Success<T> {
    return result.success === true;
  }

  static isFailure<T>(result: Result<T>): result is Failure {
    return result.success === false;
  }

  static map<T, U>(result: Result<T>, fn: (value: T) => U): Result<U> {
    if (ResultUtils.isSuccess(result)) {
      return ResultUtils.ok(fn(result.value));
    }
    return result;
  }

  static flatMap<T, U>(result: Result<T>, fn: (value: T) => Result<U>): Result<U> {
    if (ResultUtils.isSuccess(result)) {
      return fn(result.value);
    }
    return result;
  }

  static async fromPromise<T>(promise: Promise<T>): Promise<Result<T>> {
    try {
      const value = await promise;
      return ResultUtils.ok(value);
    } catch (error) {
      return ResultUtils.fail(
        error instanceof Error ? error.message : 'Unknown error',
        error
      );
    }
  }
}