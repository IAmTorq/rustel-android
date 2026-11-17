package cc.rustel.android;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

public final class TerminalFrameBatcherTest {
    private static final byte[] BEGIN = "\033[?2026h".getBytes(StandardCharsets.UTF_8);
    private static final byte[] END = "\033[?2026l".getBytes(StandardCharsets.UTF_8);

    private static void require(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    public static void main(String[] args) throws Exception {
        byte[] source = "\033[?2026hUnicode: café 中文 ⣿\033[?2026l".getBytes(StandardCharsets.UTF_8);
        // Every split, including inside UTF-8 and either protocol marker,
        // must retain the exact stream and close its frame.
        for (int split = 1; split < source.length; split++) {
            TerminalFrameBatcher batches = new TerminalFrameBatcher();
            ByteArrayOutputStream received = new ByteArrayOutputStream();
            for (byte[] part : new byte[][] {Arrays.copyOfRange(source, 0, split), Arrays.copyOfRange(source, split, source.length)}) {
                byte[] output = batches.append(part);
                if (output != null) received.write(output);
            }
            byte[] output = batches.finish();
            if (output != null) received.write(output);
            require(Arrays.equals(source, received.toByteArray()), "Stream changed at split " + split);
        }
        TerminalFrameBatcher batches = new TerminalFrameBatcher();
        require(batches.append(BEGIN) == null, "Open frame emitted prematurely");
        require(batches.append("body".getBytes(StandardCharsets.UTF_8)) == null, "Partial frame emitted prematurely");
        require(batches.append(END) != null, "Completed frame was held");
        require(batches.finish() == null, "Completed frame emitted twice");
        byte[] plain = "cursor only".getBytes(StandardCharsets.UTF_8);
        require(Arrays.equals(plain, batches.append(plain)), "Unframed controls were delayed");
        require(batches.append(BEGIN) == null, "Unexpected open frame output");
        byte[] block = new byte[128 * 1024]; Arrays.fill(block, (byte)'x');
        for (int i = 0; i < 3; i++) require(batches.append(block) == null, "Small open frame emitted");
        require(batches.append(block) != null, "Oversized frame exceeded the memory threshold");
        require(batches.append(END) != null, "Frame completion was lost after bounded flush");
        require(batches.append(BEGIN) == null, "Unexpected empty-frame output");
        require(Arrays.equals(BEGIN, batches.finish()), "EOF lost an incomplete frame");
        batches=new TerminalFrameBatcher();
        ByteArrayOutputStream joined=new ByteArrayOutputStream();
        joined.write(source);joined.write(BEGIN);joined.write("next".getBytes(StandardCharsets.UTF_8));
        require(Arrays.equals(source,batches.append(joined.toByteArray())),
            "A finished frame waited for the following partial frame");
        ByteArrayOutputStream next=new ByteArrayOutputStream();next.write(BEGIN);next.write("next".getBytes(StandardCharsets.UTF_8));next.write(END);
        require(Arrays.equals(next.toByteArray(),batches.append(END)),"Retained next frame changed");
        require(batches.finish()==null,"Retained frame emitted twice");
        for(int split=1;split<source.length;split++){
            batches=new TerminalFrameBatcher();ByteArrayOutputStream emitted=new ByteArrayOutputStream();
            byte[] first=batches.append(Arrays.copyOfRange(source,0,split));if(first!=null)emitted.write(first);
            joined.reset();joined.write(source,split,source.length-split);joined.write(BEGIN);joined.write('x');
            byte[] completed=batches.append(joined.toByteArray());if(completed!=null)emitted.write(completed);
            require(Arrays.equals(source,emitted.toByteArray()),"Completed prefix delayed or changed at split "+split);
            joined.reset();joined.write(BEGIN);joined.write('x');
            require(Arrays.equals(joined.toByteArray(),batches.finish()),"Partial suffix changed at split "+split);
        }
        ByteArrayOutputStream stream=new ByteArrayOutputStream();
        for(int i=0;i<128;i++){stream.write(source);if(i%7==0)stream.write(plain);}
        byte[] all=stream.toByteArray();
        for(int seed=0;seed<16;seed++){
            batches=new TerminalFrameBatcher();ByteArrayOutputStream emitted=new ByteArrayOutputStream();
            java.util.Random random=new java.util.Random(seed);
            for(int start=0;start<all.length;){
                int end=Math.min(all.length,start+1+random.nextInt(137));
                byte[] output=batches.append(Arrays.copyOfRange(all,start,end));if(output!=null)emitted.write(output);start=end;
            }
            byte[] output=batches.finish();if(output!=null)emitted.write(output);
            require(Arrays.equals(all,emitted.toByteArray()),"Random chunking changed the stream for seed "+seed);
        }
        System.out.println("PASS: fragmented UTF-8/markers, completed prefixes, retained suffixes, randomized streams, bounded large frames and EOF");
    }
}
