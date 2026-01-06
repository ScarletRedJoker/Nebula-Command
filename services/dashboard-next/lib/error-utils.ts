export interface ApiError {
  message: string;
  status?: number;
  code?: string;
}

export interface FriendlyError {
  title: string;
  message: string;
  canRetry: boolean;
  showContactSupport?: boolean;
}

export function parseApiError(error: unknown, response?: Response | null): ApiError {
  if (response && !response.ok) {
    return {
      message: response.statusText || "Request failed",
      status: response.status,
    };
  }

  if (error instanceof TypeError && error.message.includes("fetch")) {
    return {
      message: "Failed to fetch",
      code: "NETWORK_ERROR",
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
    };
  }

  return {
    message: String(error) || "Unknown error",
  };
}

export function getFriendlyError(error: ApiError): FriendlyError {
  if (error.status === 401 || error.status === 403) {
    return {
      title: "Session Expired",
      message: "Please log in again to continue.",
      canRetry: false,
    };
  }

  if (error.status === 404) {
    return {
      title: "Not Found",
      message: "The requested resource could not be found.",
      canRetry: false,
    };
  }

  if (error.status === 429) {
    return {
      title: "Too Many Requests",
      message: "You've made too many requests. Please wait a moment and try again.",
      canRetry: true,
    };
  }

  if (error.status && error.status >= 500) {
    return {
      title: "Server Error",
      message: "Something went wrong on our end. Please try again later.",
      canRetry: true,
      showContactSupport: true,
    };
  }

  if (error.code === "NETWORK_ERROR" || error.message.toLowerCase().includes("failed to fetch")) {
    return {
      title: "Connection Error",
      message: "Unable to connect. Please check your internet connection.",
      canRetry: true,
    };
  }

  if (error.message.toLowerCase().includes("timeout")) {
    return {
      title: "Request Timeout",
      message: "The server took too long to respond. Please try again.",
      canRetry: true,
    };
  }

  if (error.message.toLowerCase().includes("network") || 
      error.message.toLowerCase().includes("offline")) {
    return {
      title: "Network Issue",
      message: "Server is temporarily unavailable. Please try again later.",
      canRetry: true,
    };
  }

  return {
    title: "Something Went Wrong",
    message: error.message || "An unexpected error occurred. Please try again.",
    canRetry: true,
  };
}

export function getErrorMessage(error: unknown, response?: Response | null): FriendlyError {
  const apiError = parseApiError(error, response);
  return getFriendlyError(apiError);
}
