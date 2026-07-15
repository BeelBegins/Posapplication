package com.beelbegins.aimaticpos;

import android.content.Context;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.BridgeActivity;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SecureStoragePlugin.class);
        super.onCreate(savedInstanceState);
        bridge.getWebView().addJavascriptInterface(new AppStore(this), "AndroidStore");
        bridge.getWebView().addJavascriptInterface(new ReceiptPrinter(this), "AndroidPrint");
    }

    static final class AppStore {
        private final File target;
        private final File catalogTarget;

        AppStore(Context context) {
            target = new File(context.getFilesDir(), "aimatic-pos-mobile.json");
            catalogTarget = new File(context.getFilesDir(), "aimatic-pos-mobile-catalog.json");
        }

        @JavascriptInterface
        public synchronized String load() {
            return loadFile(target);
        }

        @JavascriptInterface
        public synchronized String loadCatalog() {
            return loadFile(catalogTarget);
        }

        private String loadFile(File source) {
            if (!source.exists()) return "";
            try (FileInputStream input = new FileInputStream(source)) {
                byte[] bytes = new byte[(int) source.length()];
                int offset = 0;
                while (offset < bytes.length) {
                    int count = input.read(bytes, offset, bytes.length - offset);
                    if (count < 0) break;
                    offset += count;
                }
                return new String(bytes, 0, offset, StandardCharsets.UTF_8);
            } catch (Exception ignored) {
                return "";
            }
        }

        @JavascriptInterface
        public synchronized void save(String value) {
            saveFile(target, value);
        }

        @JavascriptInterface
        public synchronized void saveCatalog(String value) {
            saveFile(catalogTarget, value);
        }

        private void saveFile(File destination, String value) {
            File temporary = new File(destination.getParentFile(), destination.getName() + ".tmp");
            try (FileOutputStream output = new FileOutputStream(temporary)) {
                output.write(value.getBytes(StandardCharsets.UTF_8));
                output.getFD().sync();
                if (destination.exists() && !destination.delete()) return;
                temporary.renameTo(destination);
            } catch (Exception ignored) {
                temporary.delete();
            }
        }
    }

    final class ReceiptPrinter {
        private final Context context;

        ReceiptPrinter(Context context) {
            this.context = context;
        }

        @JavascriptInterface
        public void printHtml(String html) {
            runOnUiThread(() -> {
                WebView receipt = new WebView(context);
                receipt.getSettings().setJavaScriptEnabled(false);
                receipt.setWebViewClient(new WebViewClient() {
                    @Override
                    public void onPageFinished(WebView view, String url) {
                        PrintManager manager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        String job = getString(com.beelbegins.aimaticpos.R.string.app_name) + " Receipt";
                        manager.print(job, view.createPrintDocumentAdapter(job), new PrintAttributes.Builder().build());
                    }
                });
                receipt.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
            });
        }
    }
}
