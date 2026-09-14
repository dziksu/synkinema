// @vitest-environment jsdom
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Channels, { ChannelSelect } from "./Channels";
import { http } from "./api/transport";
import { keys } from "./api/queries";
import defaults from "./api/generated/defaults.json";
import type {
  Channel,
  ChannelDetail,
  ChannelReview,
  ProjectSnapshot,
  Publication,
} from "./api/generated/client";

vi.mock("./api/transport", () => ({
  http: {
    api: {
      listChannels: vi.fn(),
      getChannel: vi.fn(),
      updateChannel: vi.fn(),
      createChannel: vi.fn(),
      recordChannelPublication: vi.fn(),
      recordChannelReview: vi.fn(),
      projects: vi.fn(),
      project: vi.fn(),
      operation: vi.fn(),
      uploadChannelLogo: vi.fn(),
    },
  },
}));
let client: QueryClient;
let channel: Channel;
let detail: ChannelDetail;
const onProject = vi.fn();
beforeEach(() => {
  channel = {
    ...defaults.channel,
    id: "c",
    name: "SpawnBrief",
    language: "en",
    voice_gender: "male",
    hook_guidance: "Imagine playing with friends",
  } as Channel;
  detail = {
    channel,
    projects: [
      { id: "p", name: "Mountain short", revision: 3, duration_ms: 16200 },
    ],
    publications: [],
    reviews: [],
  };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.mocked(http.api.listChannels).mockResolvedValue([channel]);
  vi.mocked(http.api.getChannel).mockResolvedValue(detail);
  vi.mocked(http.api.projects).mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.resetAllMocks();
});
function setup(channelId: string | null = "c") {
  return render(
    <QueryClientProvider client={client}>
      <Channels
        channelId={channelId}
        onSelect={() => {}}
        onProject={onProject}
        onNewProject={() => {}}
      />
    </QueryClientProvider>,
  );
}

it("shows channel guidance and links back to assigned projects", async () => {
  setup();
  expect(await screen.findByText("Imagine playing with friends")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Mountain short/ }));
  expect(onProject).toHaveBeenCalledWith("p");
  expect(
    screen.getByText(/No account connections or auto-publishing/),
  ).toBeTruthy();
});

it("keeps dirty rules on a remote channel edit and offers explicit reload", async () => {
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit channel brief" }),
  );
  fireEvent.change(screen.getByLabelText("Channel name"), {
    target: { value: "My unsaved draft" },
  });
  client.setQueryData(keys.channel("c"), {
    ...detail,
    channel: { ...channel, name: "Agent edit", version: 2 },
  });
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Channel name") as HTMLInputElement).value,
    ).toBe("My unsaved draft"),
  );
  expect(await screen.findByText(/Your draft is preserved/)).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Discard draft and reload" }),
  );
  expect(
    (screen.getByLabelText("Channel name") as HTMLInputElement).value,
  ).toBe("Agent edit");
});

it("retains a rejected form without inventing a saved channel", async () => {
  vi.mocked(http.api.updateChannel).mockRejectedValue(
    new Error("Channel version conflict"),
  );
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit channel brief" }),
  );
  fireEvent.change(screen.getByLabelText("Channel name"), {
    target: { value: "New draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save channel" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Channel version conflict",
  );
  expect(
    (screen.getByLabelText("Channel name") as HTMLInputElement).value,
  ).toBe("New draft");
  expect(
    vi.mocked(http.api.updateChannel).mock.calls[0][1].expected_version,
  ).toBe(1);
});

it("offers independent projects and hides archived channels unless already selected", async () => {
  vi.mocked(http.api.listChannels).mockResolvedValue([
    channel,
    { ...channel, id: "archived", name: "Old", archived: true },
  ]);
  render(
    <QueryClientProvider client={client}>
      <ChannelSelect value="" onChange={() => {}} />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByRole("option", { name: "SpawnBrief" }),
  ).toBeTruthy();
  expect(
    screen.getByRole("option", { name: "Independent project (no channel)" }),
  ).toBeTruthy();
  expect(screen.queryByRole("option", { name: /Old/ })).toBeNull();
});

it("separates manual platform metrics from subjective editorial reviews", async () => {
  setup();
  fireEvent.click(await screen.findByRole("tab", { name: "Published videos" }));
  fireEvent.click(screen.getByRole("button", { name: "Record publication" }));
  expect((screen.getByLabelText("Views") as HTMLInputElement).value).toBe("");
  fireEvent.click(screen.getByRole("tab", { name: "Reviews and learning" }));
  expect(
    screen.getByText(/Subjective editorial score, not a virality prediction/),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Add editorial review" }));
  expect(
    (screen.getByLabelText("Inspected project revision") as HTMLInputElement)
      .value,
  ).toBe("3");
  expect(
    (screen.getByLabelText("Evidence inspected") as HTMLTextAreaElement)
      .required,
  ).toBe(true);
});

it("shows a useful empty result when desktop channel filters exclude every card", async () => {
  setup(null);
  expect(
    await screen.findByRole("button", { name: /SpawnBrief/ }),
  ).toBeTruthy();
  fireEvent.change(screen.getByRole("searchbox", { name: "Search channels" }), {
    target: { value: "no match" },
  });
  expect(screen.getByText("No channels match these filters")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("0 channels shown");
});

it("keeps publication provenance available without stretching every table row", async () => {
  detail.publications = [
    {
      id: "pub",
      title: "Mountain short",
      platform: "youtube",
      url: "https://youtube.com/shorts/example",
      status: "scheduled",
      project_id: "p",
      published_at: null,
      recorded_at: "2026-09-14T10:00:00Z",
      metrics_as_of: null,
      views: null,
      likes: null,
      comments: null,
      average_viewed_percent: null,
      evidence: "Observed in creator dashboard",
    } satisfies Publication,
  ];
  setup();
  fireEvent.click(await screen.findByRole("tab", { name: "Published videos" }));
  expect(screen.getByText("Scheduled")).toBeTruthy();
  const notes = screen
    .getByText("Source and observation notes")
    .closest("details");
  expect(notes?.open).toBe(false);
  fireEvent.click(screen.getByText("Source and observation notes"));
  expect(notes?.open).toBe(true);
  expect(screen.getByText("Observed in creator dashboard")).toBeTruthy();
});

it("supports keyboard tab navigation and collapses review evidence", async () => {
  detail.reviews = [
    {
      id: "review",
      project_id: "p",
      project_revision: 3,
      author: "owner",
      created_at: "2026-09-14T10:00:00Z",
      score: 80,
      hook: 8,
      pacing: 8,
      clarity: 8,
      cta: 8,
      channel_fit: 8,
      evidence: "Inspected rendered frames",
      strengths: "Clear hook",
      improvements: "Shorten the outro",
    } satisfies ChannelReview,
  ];
  setup();
  const direction = await screen.findByRole("tab", { name: "Direction" });
  fireEvent.keyDown(direction, { key: "End" });
  expect(
    screen
      .getByRole("tab", { name: "Reviews and learning" })
      .getAttribute("aria-selected"),
  ).toBe("true");
  expect(screen.getByText("Shorten the outro")).toBeTruthy();
  const evidence = screen.getByText("Evidence inspected").closest("details");
  expect(evidence?.open).toBe(false);
});

it("groups public YouTube and Studio links without losing either URL on save", async () => {
  channel.links = [
    { platform: "youtube", url: "https://www.youtube.com/@spawnbrief" },
    {
      platform: "youtube",
      url: "https://studio.youtube.com/channel/channel-id",
    },
  ];
  vi.mocked(http.api.updateChannel).mockResolvedValue({
    ...channel,
    version: 2,
  });
  setup();
  expect(
    await screen.findByRole("link", { name: "YouTube Studio" }),
  ).toHaveProperty("href", channel.links[1].url);
  fireEvent.click(screen.getByRole("button", { name: "Edit channel brief" }));
  expect(screen.getByLabelText("YouTube · Channel URL")).toHaveProperty(
    "value",
    channel.links[0].url,
  );
  expect(screen.getByLabelText("YouTube Studio · Channel URL")).toHaveProperty(
    "value",
    channel.links[1].url,
  );
  expect(
    screen.getAllByRole("button", { name: "Add another link" }),
  ).toHaveLength(1);
  expect(screen.getByLabelText("Standing editorial rules")).toHaveProperty(
    "rows",
    14,
  );
  fireEvent.click(screen.getByRole("button", { name: "Save channel" }));
  await waitFor(() =>
    expect(http.api.updateChannel).toHaveBeenCalledWith(
      "c",
      expect.objectContaining({ links: channel.links, expected_version: 1 }),
    ),
  );
});

it("adds and removes several URLs under one platform", async () => {
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit channel brief" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Add platform link" }));
  fireEvent.change(screen.getByLabelText("YouTube · Channel URL"), {
    target: { value: "https://youtube.com/@spawnbrief" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add another link" }));
  expect(screen.getAllByLabelText("YouTube · Channel URL")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Remove link 2" }));
  expect(screen.getByLabelText("YouTube · Channel URL")).toHaveProperty(
    "value",
    "https://youtube.com/@spawnbrief",
  );
});

function candidate(channelId: string | null = null): ProjectSnapshot {
  return {
    ...defaults.project,
    id: "existing",
    name: "Existing gameplay short",
    revision: 7,
    channel_id: channelId,
  } as ProjectSnapshot;
}

function linkedProject(): ProjectSnapshot {
  return { ...candidate("c"), id: "p", name: "Mountain short", revision: 9 };
}

it("confirms unlinking without navigating or deleting and keeps the project independent", async () => {
  const project = linkedProject();
  vi.mocked(http.api.project).mockResolvedValue(project);
  vi.mocked(http.api.operation).mockImplementation(async () => {
    const saved = {
      ...project,
      revision: 10,
      channel_id: null,
      channel_context: null,
    };
    vi.mocked(http.api.project).mockResolvedValue(saved);
    vi.mocked(http.api.getChannel).mockResolvedValue({
      ...detail,
      projects: [],
    });
    return saved;
  });
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Unlink project" }),
  );
  expect(screen.getByRole("dialog").textContent).toContain(
    "timeline and media will stay intact",
  );
  expect(http.api.operation).not.toHaveBeenCalled();
  expect(onProject).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(http.api.operation).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Unlink project" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirm unlink" }));
  await waitFor(() =>
    expect(http.api.operation).toHaveBeenCalledWith("p", {
      expected_revision: 9,
      type: "update_project",
      payload: { channel_id: null },
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(await screen.findByText("No linked projects yet")).toBeTruthy();
  expect(
    client.getQueryData<ProjectSnapshot>(keys.project("p"))?.channel_id,
  ).toBeNull();
  expect(http.api.operation).toHaveBeenCalledTimes(1);
});

it("keeps an unlink conflict visible and rolls back without retrying", async () => {
  const project = linkedProject();
  vi.mocked(http.api.project).mockResolvedValue(project);
  let reject!: (error: Error) => void;
  vi.mocked(http.api.operation).mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail;
      }),
  );
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Unlink project" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm unlink" }));
  await waitFor(() => expect(http.api.operation).toHaveBeenCalledTimes(1));
  expect(screen.getByRole("button", { name: "Unlinking…" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(screen.getByRole("button", { name: "Cancel" })).toHaveProperty(
    "disabled",
    true,
  );
  reject(new Error("Project revision conflict"));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Project revision conflict",
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(
    client.getQueryData<ProjectSnapshot>(keys.project("p"))?.channel_id,
  ).toBe("c");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: /^Mountain short/ })).toBeTruthy();
  expect(http.api.operation).toHaveBeenCalledTimes(1);
});

it("does not unlink a project reassigned by another client", async () => {
  vi.mocked(http.api.project).mockResolvedValue({
    ...linkedProject(),
    channel_id: "other",
  });
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Unlink project" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Confirm unlink" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "no longer linked to this channel",
  );
  expect(http.api.operation).not.toHaveBeenCalled();
  expect(
    client.getQueryData<ProjectSnapshot>(keys.project("p"))?.channel_id,
  ).toBe("other");
});

it("links an existing project using the confirmed revision and refreshes channel projects", async () => {
  const project = candidate();
  vi.mocked(http.api.projects).mockResolvedValue([project]);
  vi.mocked(http.api.project).mockResolvedValue(project);
  vi.mocked(http.api.operation).mockImplementation(async () => {
    const saved = { ...project, revision: 8, channel_id: "c" };
    vi.mocked(http.api.project).mockResolvedValue(saved);
    detail = {
      ...detail,
      projects: [
        ...detail.projects,
        { id: project.id, name: project.name, revision: 8, duration_ms: 0 },
      ],
    };
    vi.mocked(http.api.getChannel).mockResolvedValue(detail);
    return saved;
  });
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Link existing project" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /Existing gameplay short/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Link project" }));
  await waitFor(() =>
    expect(http.api.operation).toHaveBeenCalledWith("existing", {
      expected_revision: 7,
      type: "update_project",
      payload: { channel_id: "c" },
    }),
  );
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(
    await screen.findByRole("button", { name: /Existing gameplay short/ }),
  ).toBeTruthy();
});

it("shows reassignment explicitly and rolls back a rejected project link without retry", async () => {
  const project = candidate("other-channel");
  vi.mocked(http.api.projects).mockResolvedValue([project]);
  vi.mocked(http.api.project).mockResolvedValue(project);
  vi.mocked(http.api.operation).mockRejectedValue(
    new Error("Project revision conflict"),
  );
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Link existing project" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /Existing gameplay short/ }),
  );
  expect(
    screen.getByText(/This project will move from other-channel to SpawnBrief/),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Move project to this channel" }),
  );
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Project revision conflict",
  );
  expect(http.api.operation).toHaveBeenCalledTimes(1);
  expect(
    client.getQueryData<ProjectSnapshot>(keys.project("existing"))?.channel_id,
  ).toBe("other-channel");
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("requires reconfirmation when another client changed the chosen assignment", async () => {
  vi.mocked(http.api.projects).mockResolvedValue([candidate()]);
  vi.mocked(http.api.project).mockResolvedValue(candidate("changed-channel"));
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Link existing project" }),
  );
  fireEvent.click(
    await screen.findByRole("button", { name: /Existing gameplay short/ }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Link project" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "The project assignment changed. Review it and confirm again.",
  );
  expect(http.api.operation).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Move project to this channel" }),
  ).toBeTruthy();
});

it("uploads a logo as a draft and only associates it on Save channel", async () => {
  const id = "a".repeat(64);
  vi.mocked(http.api.uploadChannelLogo).mockResolvedValue({
    id,
    url: `/media/channel-logos/${id}.png`,
    width: 512,
    height: 512,
  });
  vi.mocked(http.api.updateChannel).mockResolvedValue({
    ...channel,
    version: 2,
    logo_id: id,
  });
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit channel brief" }),
  );
  const file = new File(["image bytes"], "logo.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Channel logo"), {
    target: { files: [file] },
  });
  expect(
    await screen.findByRole("button", { name: "Remove logo" }),
  ).toBeTruthy();
  expect(http.api.uploadChannelLogo).toHaveBeenCalledWith({ file });
  expect(http.api.updateChannel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save channel" }));
  await waitFor(() =>
    expect(http.api.updateChannel).toHaveBeenCalledWith(
      "c",
      expect.objectContaining({ logo_id: id, expected_version: 1 }),
    ),
  );
});

it("keeps the previous logo and rules when an upload fails", async () => {
  channel.logo_id = "b".repeat(64);
  vi.mocked(http.api.uploadChannelLogo).mockRejectedValue(
    new Error("Invalid image"),
  );
  setup();
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit channel brief" }),
  );
  fireEvent.change(screen.getByLabelText("Channel logo"), {
    target: { files: [new File(["bad"], "bad.png", { type: "image/png" })] },
  });
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Invalid image",
  );
  expect(screen.getByRole("button", { name: "Remove logo" })).toBeTruthy();
  expect(screen.getByLabelText("Opening hooks")).toHaveProperty(
    "value",
    channel.hook_guidance,
  );
  expect(http.api.updateChannel).not.toHaveBeenCalled();
});

it("uses the shared page header and exposes the edit breadcrumb", async () => {
  setup();
  const heading = await screen.findByRole("heading", {
    name: "Channels",
  });
  expect(heading.closest("header")?.className).toBe("page-header");
  fireEvent.click(
    await screen.findByRole("button", { name: "Edit channel brief" }),
  );
  expect(
    screen.getByRole("navigation", { name: "Breadcrumb" }).textContent,
  ).toContain("Channels/SpawnBrief/Edit channel brief");
});
