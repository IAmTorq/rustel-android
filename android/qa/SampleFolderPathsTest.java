package cc.rustel.android;

import java.io.IOException;
import java.util.Arrays;

public final class SampleFolderPathsTest {
    private static void refused(String path)throws Exception{
        try{SampleFolderPaths.decode(path);throw new AssertionError("Accepted unsafe path: "+path);}
        catch(IOException expected){}
    }
    public static void main(String[] args)throws Exception{
        if(!SampleFolderPaths.decode("/token/Drums/kick%20+%20%C3%A9.wav").equals(Arrays.asList("token","Drums","kick + \u00e9.wav")))throw new AssertionError("Filename encoding changed");
        for(String path:new String[]{"/token/../x","/token/%2e%2e/x","/token/a%2fb.wav","/token/a%5cb.wav","/token/%00.wav","/token/.hidden","/token/%GG","/token/kick.wav?q=1"})refused(path);
        refused("/"+String.join("/",java.util.Collections.nCopies(65,"part")));
        refused("/"+String.join("",java.util.Collections.nCopies(8193,"a")));
        if(SampleFolderPaths.compareNames("\ue000","\ud800\udc00")>=0)throw new AssertionError("Supplementary filenames differ from Rust ordering");
        if(SampleFolderPaths.compareNames("01.wav","02.wav")>=0)throw new AssertionError("Filename order changed");
        System.out.println("PASS: sample-folder decoding, traversal limits and filename ordering");
    }
}
