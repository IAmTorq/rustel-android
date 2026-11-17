package cc.rustel.android;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Persisted document-tree grants served only to the native sample loader. */
final class SampleFolders {
    interface Sink { boolean register(String name, String base); }
    private static SampleFolders instance;
    private final Context context;
    private final SharedPreferences prefs;
    private final ServerSocket server;
    private final LinkedHashMap<String, Grant> grants = new LinkedHashMap<>();
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(4,4,0L,TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(16),r->{Thread t=new Thread(r,"Rustel sample reader");t.setDaemon(true);return t;});
    private static final class Grant {
        final String name, token; final Uri tree;
        Grant(String name,String token,Uri tree){this.name=name;this.token=token;this.tree=tree;}
    }
    static synchronized SampleFolders get(Context context) throws Exception {
        if(instance==null)instance=new SampleFolders(context.getApplicationContext());
        return instance;
    }
    private SampleFolders(Context context) throws Exception {
        this.context=context;prefs=context.getSharedPreferences("sample-folders",Context.MODE_PRIVATE);
        JSONObject saved=new JSONObject(prefs.getString("grants","{}"));
        ServerSocket listener=new ServerSocket();
        int preferred=prefs.getInt("port",0);if(preferred<0||preferred>65535)preferred=0;
        try {listener.bind(new InetSocketAddress("127.0.0.1",preferred));}
        catch(IOException unavailable){listener.close();listener=new ServerSocket();listener.bind(new InetSocketAddress("127.0.0.1",0));}
        server=listener;
        prefs.edit().putInt("port",server.getLocalPort()).apply();
        for(Iterator<String> names=saved.keys();names.hasNext();){String name=names.next();JSONObject g=saved.getJSONObject(name);grants.put(name,new Grant(name,g.getString("token"),Uri.parse(g.getString("tree"))));}
        Thread acceptor=new Thread(()->{while(!server.isClosed())try {
            Socket socket=server.accept();socket.setSoTimeout(10000);
            try{workers.execute(()->serve(socket));}catch(RejectedExecutionException busy){socket.close();}
        }catch(IOException error){if(!server.isClosed())android.util.Log.w("Rustel","Sample connection failed",error);}},"Rustel sample folders");
        acceptor.setDaemon(true);acceptor.start();
    }
    synchronized String[] names(){return grants.keySet().toArray(new String[0]);}
    private String base(Grant grant){return "http://127.0.0.1:"+server.getLocalPort()+"/"+grant.token+"/";}
    synchronized void publish(Sink sink){for(Grant grant:grants.values())if(!sink.register(grant.name,base(grant)))throw new IllegalStateException("Could not register sample folder "+grant.name);}
    synchronized void grant(String name,Uri tree,int flags,Sink sink) throws Exception {
        if(name.isEmpty()||name.getBytes(StandardCharsets.UTF_8).length>128||name.startsWith(".")||name.contains("/")||name.contains("\\")||name.chars().anyMatch(Character::isISOControl))throw new IOException("Choose an alias without path separators");
        Grant existing=grants.get(name);
        if(existing!=null&&!existing.tree.equals(tree))throw new IOException("That alias already names another folder");
        if(existing==null&&grants.size()>=32)throw new IOException("At most 32 sample folders can be granted");
        context.getContentResolver().takePersistableUriPermission(tree,flags&Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Grant grant=existing!=null?existing:new Grant(name,UUID.randomUUID().toString(),tree);
        if(!sink.register(name,base(grant)))throw new IOException("Rustel refused the sample-folder alias");
        grants.put(name,grant);save();
    }
    synchronized void refresh(String name,Sink sink) throws Exception {
        Grant old=grants.get(name);if(old==null)throw new IOException("Sample folder is unavailable");
        Grant updated=new Grant(name,UUID.randomUUID().toString(),old.tree);
        if(!sink.register(name,base(updated)))throw new IOException("Could not refresh sample folder");
        grants.put(name,updated);save();
    }
    synchronized void remove(String name,Sink sink) throws Exception {
        Grant grant=grants.get(name);if(grant==null)return;
        if(!sink.register(name,null))throw new IOException("Could not remove sample-folder alias");
        grants.remove(name);save();
        if(grants.values().stream().noneMatch(g->g.tree.equals(grant.tree)))try{context.getContentResolver().releasePersistableUriPermission(grant.tree,Intent.FLAG_GRANT_READ_URI_PERMISSION);}catch(SecurityException ignored){}
    }
    private void save() throws Exception {
        JSONObject saved=new JSONObject();for(Grant grant:grants.values())saved.put(grant.name,new JSONObject().put("token",grant.token).put("tree",grant.tree.toString()));
        if(!prefs.edit().putString("grants",saved.toString()).commit())throw new IOException("Could not save sample-folder permission");
    }
    private Uri document(Grant grant,List<String> parts) throws Exception {
        String id=DocumentsContract.getTreeDocumentId(grant.tree);
        for(String part:parts){
            Uri children=DocumentsContract.buildChildDocumentsUriUsingTree(grant.tree,id);String found=null;
            try(Cursor cursor=context.getContentResolver().query(children,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME},null,null,null)){
                if(cursor==null)throw new FileNotFoundException("Folder is unavailable");
                int count=0;while(cursor.moveToNext()){
                    if(++count>32768)throw new IOException("Folder has too many entries");
                    if(part.equals(cursor.getString(1))){if(found!=null)throw new IOException("Ambiguous sample filename");found=cursor.getString(0);}
                }
            }
            if(found==null)throw new FileNotFoundException("Sample is unavailable");id=found;
        }
        return DocumentsContract.buildDocumentUriUsingTree(grant.tree,id);
    }
    private byte[] manifest(Grant grant,List<String> prefix) throws Exception {
        final class Directory {final String id,path;final int depth;Directory(String id,String path,int depth){this.id=id;this.path=path;this.depth=depth;}}
        Uri selected=document(grant,prefix);String selectedId=DocumentsContract.getDocumentId(selected);
        ArrayDeque<Directory> pending=new ArrayDeque<>();pending.add(new Directory(selectedId,"",0));
        HashSet<String> visited=new HashSet<>();LinkedHashMap<String,org.json.JSONArray> banks=new LinkedHashMap<>();
        LinkedHashMap<String,String> aliases=new LinkedHashMap<>();int examined=0,files=0;
        while(!pending.isEmpty()){
            Directory directory=pending.removeFirst();if(!visited.add(directory.id))continue;
            Uri children=DocumentsContract.buildChildDocumentsUriUsingTree(grant.tree,directory.id);
            try(Cursor cursor=context.getContentResolver().query(children,new String[]{DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE},null,null,null)){
                if(cursor==null)throw new IOException("Folder is unavailable");
                while(cursor.moveToNext()){
                    if(++examined>32768)throw new IOException("Sample folder has too many entries");
                    String id=cursor.getString(0),name=cursor.getString(1),mime=cursor.getString(2);
                    if(name==null||name.isEmpty()||name.startsWith(".")||name.contains("/")||name.contains("\\")||name.chars().anyMatch(Character::isISOControl))continue;
                    String path=directory.path+Uri.encode(name);
                    if(DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)){
                        if(directory.depth>=32||pending.size()>=512)throw new IOException("Sample folder nesting exceeds the scan limit");
                        pending.add(new Directory(id,path+"/",directory.depth+1));continue;
                    }
                    if(!name.toLowerCase(Locale.ROOT).matches(".*\\.(wav|wave|flac|ogg|oga|opus|mp3|aif|aiff|caf|m4a)$"))continue;
                    if(++files>16384)throw new IOException("Sample folder exceeds the 16384-file limit");
                    String parent=directory.path.isEmpty()?(prefix.isEmpty()?grant.name:prefix.get(prefix.size()-1)):Uri.decode(directory.path.substring(0,directory.path.length()-1));
                    String bank=parent.substring(parent.lastIndexOf('/')+1);
                    org.json.JSONArray entries=banks.get(bank);if(entries==null){entries=new org.json.JSONArray();banks.put(bank,entries);}entries.put(path);
                    if(directory.path.isEmpty()){
                        String stem=name.substring(0,name.lastIndexOf('.'));
                        if(stem.matches("[A-Za-z0-9_-]+")){if(aliases.containsKey(stem))aliases.put(stem,null);else aliases.put(stem,path);}
                    }
                }
            }
        }
        JSONObject map=new JSONObject();StringBuilder base=new StringBuilder(base(grant));for(String part:prefix)base.append(Uri.encode(part)).append('/');map.put("_base",base.toString());
        for(Map.Entry<String,org.json.JSONArray> entry:banks.entrySet()){
            ArrayList<String> ordered=new ArrayList<>();for(int i=0;i<entry.getValue().length();i++)ordered.add(entry.getValue().getString(i));
            ordered.sort((left,right)->SampleFolderPaths.compareNames(Uri.decode(left),Uri.decode(right)));
            org.json.JSONArray array=new org.json.JSONArray();for(String path:ordered)array.put(path);map.put(entry.getKey(),array);
        }
        for(Map.Entry<String,String> entry:aliases.entrySet())if(entry.getValue()!=null&&!map.has(entry.getKey()))map.put(entry.getKey(),entry.getValue());
        byte[] bytes=map.toString().getBytes(StandardCharsets.UTF_8);if(bytes.length>4*1024*1024)throw new IOException("Sample manifest exceeds 4 MiB");return bytes;
    }
    static List<String> pathParts(String raw) throws IOException { return SampleFolderPaths.decode(raw); }
    private void serve(Socket socket){
        try(Socket owned=socket;InputStream input=owned.getInputStream();OutputStream output=new BufferedOutputStream(owned.getOutputStream())){
            ByteArrayOutputStream line=new ByteArrayOutputStream();int c;
            while((c=input.read())!=-1&&c!='\n'){if(line.size()>=8192)throw new IOException("Request is too long");if(c!='\r')line.write(c);}
            String[] request=line.toString(StandardCharsets.US_ASCII.name()).split(" ");
            if(request.length!=3||!request[0].equals("GET")){reply(output,405);return;}
            int headerBytes=0,empty=0;
            while((c=input.read())!=-1){if(++headerBytes>16384)throw new IOException("Headers are too long");if(c=='\n'){if(empty==0)break;empty=0;}else if(c!='\r')empty++;}
            List<String> parts=pathParts(request[1]);Grant grant=null;
            if(!parts.isEmpty())synchronized(this){for(Grant candidate:grants.values())if(candidate.token.equals(parts.get(0))){grant=candidate;break;}}
            if(grant==null){reply(output,404);return;}
            if(request[1].endsWith("/")){
                byte[] bytes=manifest(grant,parts.subList(1,parts.size()));
                output.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "+bytes.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));output.write(bytes);output.flush();return;
            }
            if(parts.size()<2){reply(output,404);return;}
            Uri uri=document(grant,parts.subList(1,parts.size()));
            // Open before sending success so revoked/unavailable grants fail cleanly.
            try(InputStream sample=context.getContentResolver().openInputStream(uri)){
                if(sample==null){reply(output,404);return;}
                output.write("HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
                byte[] buffer=new byte[32768];int n;while((n=sample.read(buffer))!=-1)output.write(buffer,0,n);output.flush();
            }catch(FileNotFoundException|SecurityException unavailable){reply(output,404);}
        }catch(Exception error){android.util.Log.d("Rustel","Sample request ended: "+error.getClass().getSimpleName());}
    }
    private static void reply(OutputStream out,int status)throws IOException{
        out.write(("HTTP/1.1 "+status+" Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.flush();
    }
}
