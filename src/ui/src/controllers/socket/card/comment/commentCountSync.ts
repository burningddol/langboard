const pendingLocalCommentCounts = new Map<string, number>();

export const addPendingLocalCommentCount = (cardUID: string) => {
    pendingLocalCommentCounts.set(cardUID, (pendingLocalCommentCounts.get(cardUID) ?? 0) + 1);
};

export const consumePendingLocalCommentCount = (cardUID: string) => {
    const count = pendingLocalCommentCounts.get(cardUID) ?? 0;
    if (count <= 0) {
        return false;
    }

    if (count === 1) {
        pendingLocalCommentCounts.delete(cardUID);
    } else {
        pendingLocalCommentCounts.set(cardUID, count - 1);
    }

    return true;
};
