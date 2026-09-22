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
  let active = null;
  let inFlight = null;
  let followUpRequested = false;
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
    if (inFlight) {
      followUpRequested = active !== null && !equal(latest, active);
      return inFlight;
    }
    if (equal(latest, baseline)) {
      onStatus("saved");
      return Promise.resolve();
    }

    inFlight = (async () => {
      let followUpUsed = false;
      while (true) {
        followUpRequested = false;
        active = fields(latest);
        onStatus("saving");
        try {
          await persist(active);
        } catch (error) {
          onStatus("error", error);
          return;
        }
        baseline = active;

        if (followUpUsed || (!followUpRequested && equal(latest, baseline))) {
          onStatus("saved");
          return;
        }
        followUpUsed = true;
      }
    })().finally(() => {
      active = null;
      inFlight = null;
      followUpRequested = false;
    });
    return inFlight;
  };

  return { setLatest, captureContent, requestSave };
}
