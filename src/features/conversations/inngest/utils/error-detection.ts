export interface ErrorDetectionResult {
  isMalformed: boolean;
  errorMessage?: string;
  errorDetails?: string;
}

export function isMalformedFunctionCallError(error: unknown): ErrorDetectionResult {
  // Convert error to string for comprehensive checking
  let errorString = "";
  let errorMessage = "";
  let errorStack = "";
  
  if (error instanceof Error) {
    errorMessage = error.message;
    errorStack = error.stack || "";
    errorString = `${errorMessage} ${errorStack}`;
  } else if (typeof error === "string") {
    errorString = error;
    errorMessage = error;
  } else if (error && typeof error === "object") {
    // Handle structured error objects (like from API responses)
    errorString = JSON.stringify(error);
    errorMessage = errorString;
  } else {
    return { isMalformed: false };
  }

  const lowerErrorString = errorString.toLowerCase();
  const lowerErrorMessage = errorMessage.toLowerCase();
  
  // Check for explicit malformed function call indicators
  const hasMalformedKeyword = 
    lowerErrorString.includes("malformed_function_call") ||
    lowerErrorString.includes("malformed function call") ||
    lowerErrorString.includes("finishreason") && lowerErrorString.includes("malformed");
  
  // Check for malformed JSON patterns (commas at start of lines in function calls)
  const hasMalformedPattern = 
    (lowerErrorString.includes("call:createfiles") || lowerErrorString.includes("call:createfolder")) &&
    (lowerErrorString.includes(", \"") || lowerErrorString.includes(",   \"") || lowerErrorString.includes(", \\\""));
  
  // Check for the specific pattern from your error
  const hasParameterPattern = 
    lowerErrorString.includes("parameters:{") && 
    (lowerErrorString.includes(", \"name\"") || lowerErrorString.includes(", \\\"name\\\""));
  
  if (hasMalformedKeyword || hasMalformedPattern || hasParameterPattern) {
    return {
      isMalformed: true,
      errorMessage: errorMessage.substring(0, 500), // Limit length
      errorDetails: errorStack.substring(0, 1000), // Limit length
    };
  }
  
  return { isMalformed: false };
}
