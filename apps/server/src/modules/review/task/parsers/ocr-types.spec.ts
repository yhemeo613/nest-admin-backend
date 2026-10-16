import { extractUsage, OcrRawRecord } from './ocr-types';

describe('extractUsage（OpenAI/Anthropic usage 结构兼容）', () => {
  it('OpenAI 结构：prompt_tokens/completion_tokens', () => {
    const rec: OcrRawRecord = {
      session_id: 's',
      request_id: 'r',
      timestamp: 't',
      response_body: { usage: { prompt_tokens: 100, completion_tokens: 42 } },
    };
    expect(extractUsage(rec)).toEqual({ tokensIn: 100, tokensOut: 42 });
  });

  it('Anthropic 结构：input_tokens/output_tokens', () => {
    const rec: OcrRawRecord = {
      session_id: 's',
      request_id: 'r',
      timestamp: 't',
      response_body: { usage: { input_tokens: 88, output_tokens: 7 } },
    };
    expect(extractUsage(rec)).toEqual({ tokensIn: 88, tokensOut: 7 });
  });

  it('流式响应（无 response_body）或非对象 → null', () => {
    expect(
      extractUsage({
        session_id: 's',
        request_id: 'r',
        timestamp: 't',
        response_body_text: 'data: ...',
      }),
    ).toEqual({ tokensIn: null, tokensOut: null });
    expect(extractUsage({ session_id: 's', request_id: 'r', timestamp: 't' })).toEqual({
      tokensIn: null,
      tokensOut: null,
    });
  });
});
