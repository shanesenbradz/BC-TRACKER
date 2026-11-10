import org.objectweb.asm.*;
import java.io.*;
import java.nio.file.*;
import java.util.zip.*;

/** Removes MethodParameters attributes from class files, or from every class
 *  in a jar (StripParams in.jar out.jar). Newer javac and newer android.jar
 *  files carry entries the older d8 builds cannot read. */
public class StripParams {
    static byte[] strip(byte[] in) {
        ClassReader r = new ClassReader(in);
        ClassWriter w = new ClassWriter(0);
        r.accept(new ClassVisitor(Opcodes.ASM7, w) {
            @Override
            public MethodVisitor visitMethod(int acc, String n, String d, String s, String[] e) {
                return new MethodVisitor(Opcodes.ASM7, super.visitMethod(acc, n, d, s, e)) {
                    @Override public void visitParameter(String name, int access) {}
                };
            }
        }, 0);
        return w.toByteArray();
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 2 && args[0].endsWith(".jar")) {
            try (ZipInputStream zin = new ZipInputStream(new BufferedInputStream(new FileInputStream(args[0])));
                 ZipOutputStream zout = new ZipOutputStream(new BufferedOutputStream(new FileOutputStream(args[1])))) {
                ZipEntry e;
                while ((e = zin.getNextEntry()) != null) {
                    if (!e.getName().endsWith(".class")) continue;
                    byte[] b = zin.readAllBytes();
                    try { b = strip(b); } catch (Exception ignored) {}
                    zout.putNextEntry(new ZipEntry(e.getName()));
                    zout.write(b);
                    zout.closeEntry();
                }
            }
            return;
        }
        for (String a : args) {
            Path p = Paths.get(a);
            Files.write(p, strip(Files.readAllBytes(p)));
        }
    }
}
