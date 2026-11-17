package cc.rustel.android;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

final class SampleFolderPaths {
    static List<String> decode(String raw) throws IOException {
        if(raw.length()>8192||raw.indexOf('?')>=0||raw.indexOf('#')>=0)throw new IOException("Invalid sample request");
        List<String> parts=new ArrayList<>();
        for(String encoded:raw.split("/",-1)){
            if(encoded.isEmpty())continue;
            final String part;
            try { part=URLDecoder.decode(encoded.replace("+","%2B"),"UTF-8"); }
            catch(IllegalArgumentException error){throw new IOException("Invalid sample path encoding",error);}
            if(part.isEmpty()||part.startsWith(".")||part.contains("/")||part.contains("\\")||part.chars().anyMatch(Character::isISOControl))throw new IOException("Sample path must stay inside its folder");
            parts.add(part);if(parts.size()>64)throw new IOException("Sample path is too deep");
        }
        return parts;
    }

    /** Match Rust's UTF-8 filename ordering, including supplementary characters. */
    static int compareNames(String left,String right){
        byte[] a=left.getBytes(StandardCharsets.UTF_8),b=right.getBytes(StandardCharsets.UTF_8);
        for(int i=0;i<Math.min(a.length,b.length);i++){int difference=(a[i]&255)-(b[i]&255);if(difference!=0)return difference;}
        return Integer.compare(a.length,b.length);
    }
}
