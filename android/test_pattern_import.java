package cc.rustel.android;
import java.io.*;
import java.nio.file.*;
import java.util.*;

class PatternImportTest {
    static void check(boolean value) {if(!value)throw new AssertionError();}
    static class Tracked extends ByteArrayInputStream {
        boolean closed;
        Tracked(byte[] bytes) {super(bytes);}
        public void close() throws IOException {closed=true;super.close();}
    }
    static void fails(File cache,InputStream input) throws Exception {
        File dir=new File(cache,"pattern-imports");
        int before=dir.isDirectory()?dir.list().length:0;
        try {PatternImport.stage(cache,input);throw new AssertionError("Expected refusal");}
        catch(IOException expected) {}
        check(!dir.isDirectory()||dir.list().length==before);
    }
    public static void main(String[] args) throws Exception {
        File cache=Files.createTempDirectory("rustel-pattern-test-").toFile();
        byte[] pattern="{\"a\":{\"code\":\"$: s(\\\"bd\\\")\"}}".getBytes("UTF-8");
        Tracked input=new Tracked(pattern);
        File first=PatternImport.stage(cache,input),second=PatternImport.stage(cache,new ByteArrayInputStream(pattern));
        check(input.closed&&first.isFile()&&!first.equals(second));
        check(Arrays.equals(pattern,Files.readAllBytes(first.toPath())));
        Tracked empty=new Tracked(new byte[0]);fails(cache,empty);check(empty.closed);
        Tracked large=new Tracked(new byte[PatternImport.MAX_BYTES+1]);fails(cache,large);check(large.closed);
        File exact=PatternImport.stage(cache,new ByteArrayInputStream(new byte[PatternImport.MAX_BYTES]));
        check(exact.length()==PatternImport.MAX_BYTES);
        fails(cache,new InputStream(){public int read()throws IOException{throw new IOException("provider failed");}});
        fails(cache,null);
        File blocked=new File(cache,"blocked");Files.write(blocked.toPath(),new byte[]{1});
        Tracked denied=new Tracked(pattern);fails(blocked,denied);check(denied.closed);
        System.out.println("PASSED: exact JSON bytes; unique private files; 4 MiB boundary; null, empty, oversized, denied-directory and provider errors; streams closed and partial files removed");
    }
}
