export async function sendDiscordNotification(options: {
  webhookUrl: string;
  publicBaseUrl: string;
}): Promise<void> {
  const reportUrl = `${options.publicBaseUrl}/reports/latest`;
  const response = await fetch(options.webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      content: `GitHub activity digest is ready: ${reportUrl}`,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Discord webhook failed with ${response.status} ${response.statusText}.`,
    );
  }
}
