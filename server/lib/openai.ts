/**
 * Process a documentation page using OpenAI's API
 */
export async function processDocPage(
  content: string,
  apiKey: string
): Promise<void> {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content:
              'You are a documentation analyzer. Your task is to validate and improve documentation content.',
          },
          {
            role: 'user',
            content: `Please analyze this documentation content:\n\n${content}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 150,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI API error: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error: any) {
    throw new Error(`Failed to process documentation: ${error.message}`);
  }
}
