package com.schoolworkhub.app;

import android.app.Activity;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private static final String CHANNEL_ID = "schoolwork-hub-alerts";
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        WebView view = new WebView(this);
        view.addJavascriptInterface(new AndroidNotifications(), "AndroidNotifications");
        view.setWebViewClient(new WebViewClient());
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        view.loadUrl("file:///android_asset/index.html");
        setContentView(view);
        createNotificationChannel();
    }
    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Schoolwork Hub", NotificationManager.IMPORTANCE_DEFAULT);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }
    private class AndroidNotifications {
        @JavascriptInterface public void notify(String title, String body) {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != 0) requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 42);
            android.app.Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? new android.app.Notification.Builder(MainActivity.this, CHANNEL_ID) : new android.app.Notification.Builder(MainActivity.this);
            builder.setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle(title).setContentText(body).setAutoCancel(true);
            getSystemService(NotificationManager.class).notify((int) System.currentTimeMillis(), builder.build());
        }
    }
    @Override public void onBackPressed() { /* Keep Focus Mode inside the app. */ super.onBackPressed(); }
}
