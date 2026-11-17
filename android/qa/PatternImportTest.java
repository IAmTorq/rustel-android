package cc.rustel.android;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.util.Arrays;

/** Exercises the same bounded copy used by the Android document picker. */
public final class PatternImportTest {
    private static int checks;

    private static final class Tracked extends ByteArrayInputStream {
        boolean closed;
        Tracked(byte[] bytes) { super(bytes); }
        @Override public void close() throws IOException { closed = true; super.close(); }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
        checks++;
    }

    private static void refused(File cache, InputStream input, String message) throws Exception {
        try {
            PatternImport.stage(cache, input);
            throw new AssertionError("Expected refusal: " + message);
        } catch (IOException expected) {
            check(expected.getMessage().contains(message), expected.toString());
        }
        File directory = new File(cache, "pattern-imports");
        File[] remaining = directory.listFiles();
        check(remaining == null || remaining.length == 0, "Partial copy survived refusal");
    }

    public static void main(String[] args) throws Exception {
        File cache = Files.createTempDirectory("rustel-pattern-copy-test-").toFile();
        try {
            byte[] boundary = new byte[PatternImport.MAX_BYTES];
            Arrays.fill(boundary, (byte) 'x');
            // A final UTF-8 sequence counts in bytes, not Java characters.
            byte[] end = "é中".getBytes("UTF-8");
            System.arraycopy(end, 0, boundary, boundary.length - end.length, end.length);
            Tracked exact = new Tracked(boundary);
            File staged = PatternImport.stage(cache, exact);
            check(exact.closed, "Successful input not closed");
            check(Arrays.equals(boundary, Files.readAllBytes(staged.toPath())), "Boundary bytes changed");
            check(staged.delete(), "Cannot release successful test copy");

            Tracked oversized = new Tracked(Arrays.copyOf(boundary, boundary.length + 1));
            refused(cache, oversized, "maximum 4 MiB");
            check(oversized.closed, "Oversized input not closed");
            Tracked empty = new Tracked(new byte[0]);
            refused(cache, empty, "empty");
            check(empty.closed, "Empty input not closed");
            refused(cache, null, "could not be opened");

            final boolean[] closed = {false};
            refused(cache, new InputStream() {
                int reads;
                @Override public int read() throws IOException { throw new IOException("provider failed"); }
                @Override public int read(byte[] bytes, int offset, int length) throws IOException {
                    if (reads++ > 0) throw new IOException("provider failed");
                    bytes[offset] = 'x';
                    return 1;
                }
                @Override public void close() { closed[0] = true; }
            }, "provider failed");
            check(closed[0], "Failed provider input not closed");

            File invalidCache = new File(cache, "ordinary-file");
            Files.write(invalidCache.toPath(), new byte[] {1});
            Tracked blocked = new Tracked(new byte[] {2});
            refused(invalidCache, blocked, "Could not prepare");
            check(blocked.closed, "Input not closed after staging-directory failure");
            check(Arrays.equals(Files.readAllBytes(invalidCache.toPath()), new byte[] {1}),
                    "Existing file was overwritten");
            check(invalidCache.delete(), "Cannot clean staging-directory fixture");
            System.out.println("PASS PatternImport: " + checks + " checks");
        } finally {
            File directory = new File(cache, "pattern-imports");
            File[] remaining = directory.listFiles();
            if (remaining != null) for (File file : remaining) Files.deleteIfExists(file.toPath());
            Files.deleteIfExists(directory.toPath());
            Files.deleteIfExists(cache.toPath());
        }
    }
}
