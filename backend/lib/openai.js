export async function interpretJson({ name, properties, instructions, input, maxOutputTokens }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      store: false,
      max_output_tokens: maxOutputTokens,
      instructions,
      input: JSON.stringify(input),
      text: { format: {
        type: 'json_schema', name, strict: true,
        schema: { type: 'object', properties, required: Object.keys(properties), additionalProperties: false }
      } }
    }),
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
  const data = await response.json();
  const message = data.output?.flatMap((item) => item.content ?? []).find((item) => item.type === 'output_text');
  return message ? JSON.parse(message.text) : null;
}
