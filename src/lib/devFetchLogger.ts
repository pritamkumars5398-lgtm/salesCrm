
if (
  process.env.NODE_ENV === "development" &&
  typeof window !== "undefined" &&
  !(window as any).__fetch_intercepted__
) {
  (window as any).__fetch_intercepted__ = true;
  const originalFetch = window.fetch;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const url = input.toString();
    const method = init?.method || "GET";
    const startTime = performance.now();

    console.log(
      `%c[API Request] %c${method} %c${url}`,
      "color: #6366f1; font-weight: bold;",
      "color: #3b82f6; font-weight: bold;",
      "color: #94a3b8;"
    );

    if (init?.body) {
      try {
        console.log("[API Request Body]", JSON.parse(init.body.toString()));
      } catch {
        console.log("[API Request Body]", init.body);
      }
    }

    try {
      const response = await originalFetch(input, init);
      const duration = (performance.now() - startTime).toFixed(1);
      const statusColor = response.ok
        ? "color: #10b981; font-weight: bold;"
        : "color: #ef4444; font-weight: bold;";

      console.log(
        `%c[API Response] %c${method} %c${url} %c${response.status} (${duration}ms)`,
        "color: #6366f1; font-weight: bold;",
        "color: #3b82f6; font-weight: bold;",
        "color: #94a3b8;",
        statusColor
      );

      const clone = response.clone();
      clone
        .json()
        .then((data) => {
          console.log("[API Response Data]", data);
        })
        .catch(() => { });

      return response;
    } catch (error) {
      console.error(
        `%c[API Request Failed] %c${method} %c${url}`,
        "color: #ef4444; font-weight: bold;",
        "color: #3b82f6; font-weight: bold;",
        "color: #ef4444;",
        error
      );
      throw error;
    }
  };
}

export { };
