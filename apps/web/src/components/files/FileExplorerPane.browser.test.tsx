import { describe, expect, it, vi } from "vite-plus/test";
import { type Locator, userEvent } from "vite-plus/test/browser";

import { render } from "../../../test/render";
import { FileExplorerPane } from "./FileExplorerPane";

const STORAGE_KEY = "t3code.fileExplorerWidth";

function PreviewRow({ width = 1000, resizable = true }: { width?: number; resizable?: boolean }) {
  return (
    <div style={{ display: "flex", width, height: 300 }}>
      <div style={{ flex: 1, minWidth: 0 }}>File contents</div>
      <FileExplorerPane resizable={resizable}>Files</FileExplorerPane>
    </div>
  );
}

function drag(handle: HTMLElement, delta: number, finish = true) {
  const init = { bubbles: true, button: 0, pointerId: 1, clientX: 600 };
  handle.dispatchEvent(new PointerEvent("pointerdown", init));
  handle.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: 600 + delta }));
  if (finish) {
    handle.dispatchEvent(new PointerEvent("pointerup", { ...init, clientX: 600 + delta }));
  }
}

async function expectWidth(explorer: Locator, width: number) {
  await vi.waitFor(() => expect(explorer.element().getBoundingClientRect().width).toBe(width));
}

function storedWidth(width: number) {
  const previous = localStorage.getItem(STORAGE_KEY);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(width));
  return {
    [Symbol.dispose]() {
      if (previous === null) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, previous);
    },
  };
}

describe("FileExplorerPane", () => {
  it("resizes from the keyboard and exposes the current width and row bounds", async () => {
    using _storage = storedWidth(256);
    await using screen = await render(<PreviewRow width={600} />);
    const handle = screen.getByRole("separator", { name: "Resize file explorer" });
    const explorer = screen.getByRole("complementary", { name: "File explorer" });

    await userEvent.tab();
    await expect.element(handle).toHaveFocus();
    await userEvent.keyboard("{ArrowLeft}");
    await expectWidth(explorer, 272);
    await expect.element(handle).toHaveAttribute("aria-valuenow", "272");
    await expect.element(handle).toHaveAttribute("aria-valuemin", "160");
    await expect.element(handle).toHaveAttribute("aria-valuemax", "344");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("272");

    await userEvent.keyboard("{End}{ArrowLeft}");
    await expectWidth(explorer, 344);
    await userEvent.keyboard("{Home}{ArrowRight}");
    await expectWidth(explorer, 160);

    await screen.rerender(<PreviewRow width={360} />);
    await expect.element(handle).toHaveAttribute("aria-valuemax", "160");
    await userEvent.keyboard("{ArrowLeft}");
    await expectWidth(explorer, 160);

    await screen.rerender(<PreviewRow />);
    await userEvent.keyboard("{ArrowLeft}");
    await expectWidth(explorer, 176);
    await screen.rerender(null);
    await screen.rerender(<PreviewRow />);
    await expectWidth(explorer, 176);
  });

  it("restores the saved width after narrowing and widening the preview row", async () => {
    using _storage = storedWidth(480);
    await using screen = await render(<PreviewRow />);
    const explorer = screen.getByRole("complementary", { name: "File explorer" });
    await expectWidth(explorer, 480);

    await screen.rerender(<PreviewRow width={600} />);
    await expectWidth(explorer, 344);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("480");

    await screen.rerender(<PreviewRow width={360} />);
    await expectWidth(explorer, 160);

    await screen.rerender(<PreviewRow />);
    await expectWidth(explorer, 480);
  });

  it("clamps dragging to the row and persists the visible width on release", async () => {
    using _storage = storedWidth(256);
    await using screen = await render(<PreviewRow width={600} />);
    // Synthetic pointer ids are not active browser pointers.
    using _capture = vi
      .spyOn(HTMLElement.prototype, "setPointerCapture")
      .mockImplementation(() => {});
    const handle = screen
      .getByRole("separator", { name: "Resize file explorer" })
      .element() as HTMLElement;
    const explorer = screen.getByRole("complementary", { name: "File explorer" });

    drag(handle, -1000);
    await expectWidth(explorer, 344);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("344");

    drag(handle, 40);
    await expectWidth(explorer, 304);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("304");

    drag(handle, 1000);
    await expectWidth(explorer, 160);
    expect(localStorage.getItem(STORAGE_KEY)).toBe("160");
  });

  it("cleans up an active drag when the explorer is hidden", async () => {
    using _storage = storedWidth(256);
    await using screen = await render(<PreviewRow />);
    using _capture = vi
      .spyOn(HTMLElement.prototype, "setPointerCapture")
      .mockImplementation(() => {});
    const handle = screen
      .getByRole("separator", { name: "Resize file explorer" })
      .element() as HTMLElement;
    drag(handle, -80, false);
    expect(document.body.style.cursor).toBe("col-resize");

    await screen.unmount();
    expect(document.body.style.cursor).toBe("");
    expect(document.body.style.userSelect).toBe("");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("256");
  });

  it("does not constrain the explorer or show a splitter when no file is open", async () => {
    using _storage = storedWidth(480);
    await using screen = await render(<PreviewRow resizable={false} />);
    await expect.element(screen.getByRole("separator")).not.toBeInTheDocument();
    expect((screen.getByRole("complementary").element() as HTMLElement).style.width).toBe("");
  });
});
