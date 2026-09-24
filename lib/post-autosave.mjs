const fields = ({ title, description, content }) => ({
  title: title ?? null,
  description: description ?? null,
  content: content ?? null,
});

const equal = (left, right) =>
  left.title === right.title &&
  left.description === right.description &&
  left.content === right.content;

const canonicalContent = (content) =>
  (content ?? "").replace(/\r\n/g, "\n").trimEnd();

export function createPostAutosave({ initial, persist, onStatus }) {
  let baseline = fields(initial);
  let latest = fields(initial);
  let inFlight = null;
  let initialContentPending = true;

  const setLatest = (next) => {
    latest = fields(next);
  };

  const captureContent = (content) => {
    if (
      initialContentPending &&
      canonicalContent(content) === canonicalContent(baseline.content)
    ) {
      initialContentPending = false;
      baseline = { ...baseline, content: content ?? null };
      latest = { ...latest, content: content ?? null };
      return false;
    }
    initialContentPending = false;
    latest = { ...latest, content: content ?? null };
    return true;
  };

  const requestSave = () => {
    if (inFlight) return inFlight;
    if (equal(latest, baseline)) {
      onStatus("saved");
      return Promise.resolve();
    }

    const drain = (async () => {
      while (!equal(latest, baseline)) {
        const snapshot = fields(latest);
        onStatus("saving");
        try {
          await persist(snapshot);
        } catch (error) {
          onStatus("error", error);
          return;
        }
        baseline = snapshot;
      }
      onStatus("saved");
    })();
    const tracked = drain.finally(() => {
      if (inFlight === tracked) inFlight = null;
    });
    inFlight = tracked;
    return tracked;
  };

  return { setLatest, captureContent, requestSave };
}
