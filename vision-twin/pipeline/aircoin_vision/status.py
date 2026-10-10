"""Per-tag plant status machine (PRD 7.1 #7).

    present -> missing  after MISSING_AFTER_MS unseen
    missing -> removed  after REMOVED_AFTER_MS unseen
    suspect             when the suspect signal (low plant match / low alive_score)
                        holds for SUSPECT_AFTER_MS; clears after the same time of good readings

Short gaps (a hand passing in front of the camera) never change the status.
"""

from dataclasses import dataclass

MISSING_AFTER_MS = 10_000
REMOVED_AFTER_MS = 60_000
SUSPECT_AFTER_MS = 3_000


@dataclass
class TagState:
    status: str = "missing"
    last_seen_ms: int | None = None
    suspect_since_ms: int | None = None
    good_since_ms: int | None = None


class StatusMachine:
    def __init__(self, tag_ids, start_ms, missing_after=MISSING_AFTER_MS, removed_after=REMOVED_AFTER_MS,
                 suspect_after=SUSPECT_AFTER_MS):
        self.start_ms = start_ms
        self.missing_after = missing_after
        self.removed_after = removed_after
        self.suspect_after = suspect_after
        self.tags = {t: TagState() for t in tag_ids}

    def update(self, ts_ms, seen, suspect=()):
        """seen: tag IDs detected this cycle; suspect: subset whose plant looks wrong.
        Returns {tag_id: status}."""
        seen, suspect = set(seen), set(suspect)
        for tag, st in self.tags.items():
            if tag in seen:
                st.last_seen_ms = ts_ms
                if tag in suspect:
                    st.good_since_ms = None
                    st.suspect_since_ms = st.suspect_since_ms or ts_ms
                else:
                    st.suspect_since_ms = None
                    st.good_since_ms = st.good_since_ms or ts_ms
                if st.status == "suspect":
                    if st.good_since_ms is not None and ts_ms - st.good_since_ms >= self.suspect_after:
                        st.status = "present"
                elif st.suspect_since_ms is not None and ts_ms - st.suspect_since_ms >= self.suspect_after:
                    st.status = "suspect"
                else:
                    st.status = "present"
            else:
                unseen = ts_ms - (st.last_seen_ms if st.last_seen_ms is not None else self.start_ms)
                if unseen >= self.removed_after:
                    st.status = "removed"
                elif unseen >= self.missing_after:
                    st.status = "missing"
                elif st.last_seen_ms is None:
                    st.status = "missing"  # never seen since start
        return {t: s.status for t, s in self.tags.items()}

    def last_seen(self, tag):
        return self.tags[tag].last_seen_ms
