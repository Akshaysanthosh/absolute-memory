/** Safe operational metadata only: never persist provider messages, bodies, prompts or headers. */
export function knowledgeFailure(error: unknown) {
  let code = 'unknown',
    current = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth++) {
    const value = current as {
      name?: unknown;
      statusCode?: unknown;
      code?: unknown;
      cause?: unknown;
      finishReason?: unknown;
    };
    if (
      typeof value.statusCode === 'number' &&
      Number.isInteger(value.statusCode) &&
      value.statusCode >= 400 &&
      value.statusCode <= 599
    ) {
      code = `http-${value.statusCode}`;
      break;
    }
    if (value.name === 'PlatformLimitError') {
      code = 'capacity';
      break;
    }
    if (['AbortError', 'TimeoutError'].includes(String(value.name))) {
      code = 'timeout';
      break;
    }
    if (
      ['AI_NoObjectGeneratedError', 'AI_TypeValidationError', 'AI_JSONParseError'].includes(
        String(value.name),
      )
    ) {
      code = value.finishReason === 'length' ? 'invalid-output:length' : 'invalid-output';
      break;
    }
    if (typeof value.code === 'string' && /^(23|40|53|57|58)[0-9A-Z]{3}$/.test(value.code)) {
      code = `storage-${value.code}`;
      break;
    }
    current = value.cause;
  }
  const usage =
    error && typeof error === 'object'
      ? (error as { usage?: { inputTokens?: unknown; outputTokens?: unknown } }).usage
      : undefined;
  const tokens = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2_000_000_000
      ? value
      : 0;
  return {
    code,
    inputTokens: tokens(usage?.inputTokens),
    outputTokens: tokens(usage?.outputTokens),
  };
}
