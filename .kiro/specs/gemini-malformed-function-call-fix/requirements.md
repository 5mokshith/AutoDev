# Requirements Document

## Introduction

This feature addresses a critical production issue where the gemini-2.5-pro model generates malformed JSON in function calls, causing MALFORMED_FUNCTION_CALL errors. The malformed JSON contains commas at the start of lines instead of proper JSON formatting (e.g., `, "name":` instead of `"name":`). The solution implements automatic error detection and model fallback to gemini-2.5-flash, which does not exhibit this issue.

## Glossary

- **MALFORMED_FUNCTION_CALL**: An error type returned by Gemini API when function call JSON is syntactically invalid
- **Agent_Network**: The @inngest/agent-kit network that orchestrates AI agent execution
- **Model_Fallback**: The process of automatically switching from gemini-2.5-pro to gemini-2.5-flash when errors occur
- **Process_Message_Workflow**: The Inngest function that handles message processing and agent execution
- **Error_Boundary**: Code that catches and handles errors to prevent system failure
- **Retry_Logic**: Mechanism to re-attempt failed operations with different parameters

## Requirements

### Requirement 1: Detect Malformed Function Call Errors

**User Story:** As a system, I want to detect MALFORMED_FUNCTION_CALL errors from Gemini responses, so that I can take corrective action instead of failing the user request.

#### Acceptance Criteria

1. WHEN the Agent_Network throws an error during execution, THE Error_Detector SHALL inspect the error message for "MALFORMED_FUNCTION_CALL" or "Malformed function call" text
2. WHEN the error contains malformed JSON patterns (commas at line start), THE Error_Detector SHALL identify it as a malformed function call error
3. WHEN a malformed function call error is detected, THE Error_Detector SHALL extract relevant error details including the model name and error message
4. THE Error_Detector SHALL distinguish malformed function call errors from other error types

### Requirement 2: Implement Automatic Model Fallback

**User Story:** As a user, I want the system to automatically retry with gemini-2.5-flash when gemini-2.5-pro fails, so that my request succeeds without manual intervention.

#### Acceptance Criteria

1. WHEN a MALFORMED_FUNCTION_CALL error is detected AND the current model is gemini-2.5-pro, THE Process_Message_Workflow SHALL retry the request with gemini-2.5-flash
2. WHEN retrying with the fallback model, THE Process_Message_Workflow SHALL use the same message input and system prompt
3. WHEN retrying with the fallback model, THE Process_Message_Workflow SHALL preserve all tool configurations and parameters
4. WHEN the fallback model succeeds, THE Process_Message_Workflow SHALL complete normally and return the result
5. IF the fallback model also fails, THE Process_Message_Workflow SHALL handle the error according to existing error handling logic

### Requirement 3: Log Detailed Error Information

**User Story:** As a developer, I want detailed error logs when malformed function calls occur, so that I can debug issues and monitor the fallback mechanism.

#### Acceptance Criteria

1. WHEN a MALFORMED_FUNCTION_CALL error is detected, THE Process_Message_Workflow SHALL log the error with messageId, conversationId, projectId, and model information
2. WHEN logging the error, THE Process_Message_Workflow SHALL include the raw error message and stack trace
3. WHEN initiating a model fallback, THE Process_Message_Workflow SHALL log the fallback attempt with both original and fallback model names
4. WHEN the fallback succeeds, THE Process_Message_Workflow SHALL log the successful recovery
5. WHEN the fallback fails, THE Process_Message_Workflow SHALL log the final failure with both error details

### Requirement 4: Provide User Feedback on Fallback

**User Story:** As a user, I want to know when the system falls back to a different model, so that I understand why my request might behave differently.

#### Acceptance Criteria

1. WHEN a model fallback occurs AND succeeds, THE Process_Message_Workflow SHALL prepend a notice to the assistant response indicating the fallback
2. THE fallback notice SHALL be clear and non-technical (e.g., "Note: I switched to a different model to complete your request.")
3. WHEN the fallback fails, THE Process_Message_Workflow SHALL provide a user-friendly error message explaining the issue
4. THE error message SHALL suggest alternative actions the user can take

### Requirement 5: Preserve Existing Functionality

**User Story:** As a developer, I want the fix to not break existing functionality, so that users who don't encounter the error continue to have a seamless experience.

#### Acceptance Criteria

1. WHEN gemini-2.5-flash is used initially, THE Process_Message_Workflow SHALL execute normally without any fallback logic
2. WHEN non-Gemini models are used (OpenAI, Groq), THE Process_Message_Workflow SHALL execute normally without any fallback logic
3. WHEN gemini-2.5-pro succeeds without errors, THE Process_Message_Workflow SHALL complete normally without triggering fallback
4. THE existing error handling in the onFailure callback SHALL continue to function as before
5. THE existing agent event logging SHALL continue to function as before

### Requirement 6: Implement Robust Error Boundaries

**User Story:** As a system administrator, I want proper error boundaries around the retry logic, so that errors in the fallback mechanism don't cause system instability.

#### Acceptance Criteria

1. WHEN the fallback logic itself throws an error, THE Process_Message_Workflow SHALL catch it and handle it gracefully
2. WHEN creating agent events for error logging fails, THE Process_Message_Workflow SHALL continue execution without throwing
3. WHEN updating message content fails during error handling, THE Process_Message_Workflow SHALL log the failure but not throw
4. THE Process_Message_Workflow SHALL ensure that all error paths eventually update the message status appropriately

### Requirement 7: Support Configuration and Testing

**User Story:** As a developer, I want the fallback behavior to be configurable, so that I can test different scenarios and adjust the behavior in production.

#### Acceptance Criteria

1. THE fallback model SHALL be configurable (default: gemini-2.5-flash)
2. THE retry behavior SHALL be testable with mock errors
3. THE error detection logic SHALL be unit-testable independently
4. THE fallback logic SHALL be implementable without modifying the core agent-kit library
