/**
 * Sanitizes malformed JSON from Gemini function calls
 * Gemini often generates invalid JSON with unquoted string values
 */
export function sanitizeGeminiFunctionCall(jsonString: string): string {
  try {
    // First, try to parse as-is
    JSON.parse(jsonString);
    return jsonString; // Already valid
  } catch {
    // JSON is malformed, try to fix it
    let fixed = jsonString;
    
    // Fix 1: Add quotes around unquoted object keys
    // Pattern: {key: -> {"key":
    fixed = fixed.replace(/\{(\w+):/g, '{"$1":');
    fixed = fixed.replace(/,\s*(\w+):/g, ',"$1":');
    
    // Fix 2: Add quotes around unquoted string values (complex pattern)
    // This is tricky because we need to detect where string values start/end
    // Pattern: "key": value (where value is not a number, boolean, null, or starts with { or [)
    fixed = fixed.replace(
      /"(\w+)":\s*([^",\{\}\[\]\d\-][^,\}\]]*?)([,\}\]])/g,
      (match, key, value, terminator) => {
        const trimmedValue = value.trim();
        // Don't quote if it's already quoted, or if it's a boolean/null
        if (
          trimmedValue.startsWith('"') ||
          trimmedValue === 'true' ||
          trimmedValue === 'false' ||
          trimmedValue === 'null'
        ) {
          return match;
        }
        // Quote the value
        return `"${key}": "${trimmedValue}"${terminator}`;
      }
    );
    
    // Try to parse the fixed version
    try {
      JSON.parse(fixed);
      return fixed;
    } catch {
      // Still invalid, return original
      return jsonString;
    }
  }
}

/**
 * Sanitizes Gemini function call parameters
 * Handles the specific case where content field is not quoted
 */
export function sanitizeGeminiParams(params: unknown): unknown {
  if (typeof params === 'string') {
    return sanitizeGeminiFunctionCall(params);
  }
  
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    // Check if this looks like a malformed function call object
    const paramsObj = params as Record<string, unknown>;
    
    // If we have a 'content' field that's an object but should be a string
    if (paramsObj.content && typeof paramsObj.content === 'object') {
      try {
        // Convert the object to a JSON string
        paramsObj.content = JSON.stringify(paramsObj.content);
      } catch {
        // If stringify fails, leave it as-is
      }
    }
    
    // Handle files array
    if (Array.isArray(paramsObj.files)) {
      paramsObj.files = paramsObj.files.map((file: unknown) => {
        if (file && typeof file === 'object') {
          const fileObj = file as Record<string, unknown>;
          // If content is an object but should be a string
          if (fileObj.content && typeof fileObj.content === 'object') {
            try {
              fileObj.content = JSON.stringify(fileObj.content);
            } catch {
              // If stringify fails, leave it as-is
            }
          }
          return fileObj;
        }
        return file;
      });
    }
    
    return paramsObj;
  }
  
  return params;
}
