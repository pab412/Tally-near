// The server's settings for signing, as the host holds them. A value pasted into the host's settings with a stray space
// or line break is taken as meant: a NEAR key with a line break after it doesn't parse, and Tally trims its own copy of
// the secret the two servers share, so this side trims too.

/** A server setting, trimmed. Unset or blank is undefined. */
export const setting = (name: string): string | undefined => process.env[name]?.trim() || undefined;
