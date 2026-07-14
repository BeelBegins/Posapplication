package com.beelbegins.aimaticpos;

import android.content.SharedPreferences;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AimaticSecureStorage")
public class SecureStoragePlugin extends Plugin {
    private SharedPreferences preferences;

    @Override
    public void load() {
        try {
            MasterKey masterKey = new MasterKey.Builder(getContext())
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
            preferences = EncryptedSharedPreferences.create(
                getContext(),
                "aimatic_secure_storage_v1",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
        } catch (Exception error) {
            preferences = null;
        }
    }

    private boolean ensureReady(PluginCall call) {
        if (preferences != null) return true;
        call.reject("Android Keystore secure storage is unavailable");
        return false;
    }

    @PluginMethod
    public void get(PluginCall call) {
        if (!ensureReady(call)) return;
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("Secure storage key is required");
            return;
        }
        JSObject result = new JSObject();
        result.put("value", preferences.getString(key, null));
        call.resolve(result);
    }

    @PluginMethod
    public void set(PluginCall call) {
        if (!ensureReady(call)) return;
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || key.isEmpty() || value == null) {
            call.reject("Secure storage key and value are required");
            return;
        }
        if (!preferences.edit().putString(key, value).commit()) {
            call.reject("Secure storage write failed");
            return;
        }
        call.resolve();
    }

    @PluginMethod
    public void remove(PluginCall call) {
        if (!ensureReady(call)) return;
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("Secure storage key is required");
            return;
        }
        preferences.edit().remove(key).commit();
        call.resolve();
    }

    @PluginMethod
    public void clear(PluginCall call) {
        if (!ensureReady(call)) return;
        preferences.edit().clear().commit();
        call.resolve();
    }
}
