/**
 * LeetCodeClient — Single Responsibility: fetches data from LeetCode GraphQL API.
 * Interface Segregation: exposes only what callers need.
 * Dependency Inversion: SyncService depends on this abstraction, not fetch directly.
 */

export interface SubmissionsByDay {
  [date: string]: number; // date → unique problem count
}

export interface ILeetCodeClient {
  fetchSubmissionsByDay(username: string): Promise<SubmissionsByDay>;
}

const GRAPHQL_URL = "https://leetcode.com/graphql/";

const RECENT_SUBMISSIONS_QUERY = `
query recentAcSubmissions($username: String!, $limit: Int!) {
  recentAcSubmissionList(username: $username, limit: $limit) {
    id
    titleSlug
    timestamp
  }
}
`;

async function getCsrfToken(): Promise<string> {
  try {
    const res = await fetch("https://leetcode.com/", {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    });
    const cookie = res.headers.get("set-cookie") || "";
    const match = cookie.match(/csrftoken=([^;]+)/);
    return match?.[1] ?? "";
  } catch {
    return "";
  }
}

export class LeetCodeClient implements ILeetCodeClient {
  private csrf: string | null = null;

  private async getToken(): Promise<string> {
    if (!this.csrf) this.csrf = await getCsrfToken();
    return this.csrf;
  }

  async fetchSubmissionsByDay(username: string): Promise<SubmissionsByDay> {
    const csrf = await this.getToken();

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      Referer: `https://leetcode.com/${username}/`,
      Origin: "https://leetcode.com",
    };
    if (csrf) {
      headers["x-csrftoken"] = csrf;
      headers["Cookie"] = `csrftoken=${csrf}`;
    }

    const res = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: RECENT_SUBMISSIONS_QUERY,
        variables: { username, limit: 50 },
        operationName: "recentAcSubmissions",
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`LeetCode HTTP ${res.status}`);

    const data = await res.json();
    const submissions = data?.data?.recentAcSubmissionList;

    if (submissions == null) {
      const errs = JSON.stringify(data?.errors ?? []);
      throw new Error(`User '${username}' not found or private. ${errs}`);
    }

    // Group unique slugs by UTC date
    const byDate: Record<string, Set<string>> = {};
    for (const sub of submissions) {
      const dateStr = new Date(parseInt(sub.timestamp, 10) * 1000)
        .toISOString()
        .split("T")[0];
      if (!byDate[dateStr]) byDate[dateStr] = new Set();
      byDate[dateStr].add(sub.titleSlug);
    }

    const result: SubmissionsByDay = {};
    for (const [date, slugs] of Object.entries(byDate)) {
      result[date] = slugs.size;
    }
    return result;
  }
}
