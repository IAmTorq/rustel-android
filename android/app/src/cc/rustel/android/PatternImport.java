package cc.rustel.android;

import java.io.*;

/** A bounded private copy of a user-selected document; never modifies the original. */
final class PatternImport {
    static final int MAX_BYTES = 4 * 1024 * 1024;
    static File stage(File cache, InputStream input) throws IOException {
        if (input == null) throw new IOException("The selected file could not be opened");
        try (InputStream in = input) {
        File directory = new File(cache, "pattern-imports");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Could not prepare pattern import");
        File file = File.createTempFile("pattern-", ".json", directory);
        boolean complete = false;
        try {
            try (OutputStream out = new FileOutputStream(file)) {
                byte[] buffer = new byte[8192];
                int total = 0, count;
                while ((count = in.read(buffer)) != -1) {
                    total += count;
                    if (total > MAX_BYTES) throw new IOException("Pattern file is too large (maximum 4 MiB)");
                    out.write(buffer, 0, count);
                }
                if (total == 0) throw new IOException("The selected pattern file is empty");
            }
            complete = true;
            return file;
        } finally {
            if (!complete) file.delete();
        }
        }
    }
}
