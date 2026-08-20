# Android Application Push Notification Integration Guide (`notification_androidChanges.md`)

This guide outlines the exact changes, code structures, permissions, and API integrations required to implement **Firebase Cloud Messaging (FCM)** push notifications in the **Store Manager Android App** (Kotlin + Jetpack Compose).

---

## 1. Prerequisites & Gradle Setup

### 1.1 Project & App `build.gradle` Dependencies

Add the Firebase Bill of Materials (BoM) and Firebase Messaging dependency:

#### `app/build.gradle.kts`
```kotlin
plugins {
    id("com.android.application")
    id("kotlin-android")
    // Add Google Services plugin
    id("com.google.gms.google-services")
}

dependencies {
    // Import the Firebase BoM
    implementation(platform("com.google.firebase:firebase-bom:33.9.0"))

    // Firebase Cloud Messaging
    implementation("com.google.firebase:firebase-messaging")

    // Core Android & Compose dependencies...
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.7.0")
    implementation("androidx.activity:activity-compose:1.8.2")
}
```

#### Root `build.gradle.kts`
```kotlin
plugins {
    // Add Google Services plugin alias
    id("com.google.gms.google-services") version "4.4.1" apply false
}
```

### 1.2 Firebase Configuration File
Download `google-services.json` from the Firebase Console project and place it inside the `app/` directory:
```
AndroidProject/
└── app/
    ├── google-services.json  <-- Place file here
    ├── build.gradle.kts
    └── src/
```

---

## 2. Android Manifest Configuration

Update `app/src/main/AndroidManifest.xml` to request notification permissions and register the FCM background service.

#### `AndroidManifest.xml`
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Required for Android 13+ (API level 33+) -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <application
        android:name=".StoreApp"
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/Theme.StoreApp">

        <!-- Default Notification Channel metadata -->
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_channel_id"
            android:value="channel_inventory" />

        <!-- Default Small Icon -->
        <meta-data
            android:name="com.google.firebase.messaging.default_notification_icon"
            android:resource="@drawable/ic_notification" />

        <!-- Custom Firebase Messaging Service -->
        <service
            android:name=".service.MyFirebaseMessagingService"
            android:exported="false">
            <intent-filter>
                <action android:name="com.google.firebase.MESSAGING_EVENT" />
            </intent-filter>
        </service>

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

---

## 3. Notification Channels Setup

Create notification channels during app startup (e.g. in `Application.onCreate()` or `MainActivity.onCreate()`).

```kotlin
package com.storeapp.util

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object NotificationHelper {

    const val CHANNEL_INVENTORY = "channel_inventory"
    const val CHANNEL_TRANSFERS = "channel_transfers"
    const val CHANNEL_SALES = "channel_sales"

    fun createNotificationChannels(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // Low Stock & Inventory Alerts (High Importance)
            val inventoryChannel = NotificationChannel(
                CHANNEL_INVENTORY,
                "Inventory & Low Stock Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications when stock levels drop below reorder thresholds"
                enableVibration(true)
            }

            // Stock Transfers (High Importance)
            val transferChannel = NotificationChannel(
                CHANNEL_TRANSFERS,
                "Stock Transfers",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications for incoming and outgoing stock transfer updates"
                enableVibration(true)
            }

            // Sales & Orders (Default Importance)
            val salesChannel = NotificationChannel(
                CHANNEL_SALES,
                "Sales & Order Updates",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Lifecycle updates for sales orders"
            }

            manager.createNotificationChannels(listOf(inventoryChannel, transferChannel, salesChannel))
        }
    }
}
```

---

## 4. API DTOs & Retrofit Service

Define the Retrofit endpoints for registering and unregistering FCM tokens.

```kotlin
package com.storeapp.data.api

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.POST

// Request DTOs
data class RegisterDeviceTokenRequest(
    val deviceId: String,
    val fcmToken: String,
    val platform: String = "ANDROID",
    val deviceModel: String
)

data class UnregisterDeviceTokenRequest(
    val fcmToken: String
)

data class ApiResponse<T>(
    val success: Boolean,
    val data: T?,
    val message: String?
)

interface NotificationApiService {

    @POST("/api/v1/notifications/device-token")
    suspend fun registerDeviceToken(
        @Body request: RegisterDeviceTokenRequest
    ): Response<ApiResponse<Map<String, Boolean>>>

    @DELETE("/api/v1/notifications/device-token")
    suspend fun unregisterDeviceToken(
        @Body request: UnregisterDeviceTokenRequest
    ): Response<ApiResponse<Map<String, Boolean>>>
}
```

---

## 5. Firebase Messaging Service Implementation

Implement `FirebaseMessagingService` to receive tokens and incoming push payloads.

```kotlin
package com.storeapp.service

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.storeapp.MainActivity
import com.storeapp.R
import com.storeapp.data.repository.AuthRepository
import com.storeapp.data.repository.NotificationRepository
import com.storeapp.util.NotificationHelper
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MyFirebaseMessagingService : FirebaseMessagingService() {

    @Inject lateinit var notificationRepository: NotificationRepository
    @Inject lateinit var authRepository: AuthRepository

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d("FCM", "New FCM registration token received: $token")
        
        // If user is currently logged in, send token to backend
        CoroutineScope(Dispatchers.IO).launch {
            if (authRepository.isLoggedIn()) {
                val deviceId = getDeviceId(applicationContext)
                val deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}"
                notificationRepository.registerToken(deviceId, token, deviceModel)
            }
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        val title = remoteMessage.notification?.title 
            ?: remoteMessage.data["title"] 
            ?: "Store Alert"
            
        val body = remoteMessage.notification?.body 
            ?: remoteMessage.data["message"] 
            ?: ""

        val type = remoteMessage.data["type"] ?: "GENERAL"
        val entityId = remoteMessage.data["entityId"] ?: ""
        val route = remoteMessage.data["route"] ?: ""

        showNativeNotification(title, body, type, entityId, route)
    }

    private fun showNativeNotification(
        title: String,
        body: String,
        type: String,
        entityId: String,
        route: String
    ) {
        val channelId = when (type) {
            "LOW_STOCK" -> NotificationHelper.CHANNEL_INVENTORY
            "STOCK_TRANSFER" -> NotificationHelper.CHANNEL_TRANSFERS
            else -> NotificationHelper.CHANNEL_SALES
        }

        // Intent to launch app and navigate to specific screen
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("EXTRA_TARGET_ROUTE", route)
            putExtra("EXTRA_ENTITY_ID", entityId)
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            System.currentTimeMillis().toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notificationBuilder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)

        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(System.currentTimeMillis().toInt(), notificationBuilder.build())
    }

    private fun getDeviceId(context: Context): String {
        return android.provider.Settings.Secure.getString(
            context.contentResolver,
            android.provider.Settings.Secure.ANDROID_ID
        ) ?: "unknown_android_device"
    }
}
```

---

## 6. Runtime Notification Permission (Android 13+)

In Android 13+ (API level 33), runtime permission for notifications is required. Implement permission launcher in your main Jetpack Compose screen or Activity.

```kotlin
@Composable
fun RequestNotificationPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        val context = LocalContext.current
        val launcher = rememberLauncherForActivityResult(
            contract = ActivityResultContracts.RequestPermission()
        ) { isGranted ->
            if (isGranted) {
                Log.d("Permission", "Notification permission granted")
            } else {
                Log.w("Permission", "Notification permission denied")
            }
        }

        LaunchedEffect(Unit) {
            val permission = android.Manifest.permission.POST_NOTIFICATIONS
            if (ContextCompat.checkSelfPermission(context, permission) != PackageManager.PERMISSION_GRANTED) {
                launcher.launch(permission)
            }
        }
    }
}
```

---

## 7. Login & Logout Token Sync Lifecycle

### 7.1 On Successful Login

Register device token right after login:

```kotlin
fun onLoginSuccess(context: Context, tokenRepository: NotificationRepository) {
    FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
        if (task.isSuccessful && task.result != null) {
            val fcmToken = task.result
            val deviceId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            val deviceModel = "${Build.MANUFACTURER} ${Build.MODEL}"

            CoroutineScope(Dispatchers.IO).launch {
                tokenRepository.registerToken(deviceId, fcmToken, deviceModel)
            }
        }
    }
}
```

### 7.2 On User Logout

Unregister token from backend **before** clearing auth credentials:

```kotlin
suspend fun logout(context: Context, tokenRepository: NotificationRepository) {
    try {
        val fcmToken = FirebaseMessaging.getInstance().token.await()
        tokenRepository.unregisterToken(fcmToken)
    } catch (e: Exception) {
        Log.e("Logout", "Failed to unregister FCM token", e)
    } finally {
        // Clear stored access/refresh tokens in EncryptedSharedPreferences
        authLocalDataSource.clearTokens()
    }
}
```

---

## 8. Payload Mapping & Deep Linking Table

When `onMessageReceived` receives data payload keys, map them to your Compose Navigation routes:

| Backend `type` | Payload `route` | Payload `entityId` | App Target Screen |
|---|---|---|---|
| `LOW_STOCK` | `INVENTORY` | `productId` | `NavRoute.Inventory` (Filtered to Product) |
| `STOCK_TRANSFER` | `STOCK_TRANSFER_DETAIL` | `transferId` | `NavRoute.StockTransferDetail(id)` |
| `SALE_STATUS` | `SALE_DETAIL` | `saleId` | `NavRoute.SaleDetail(id)` |
| `PURCHASE_STATUS` | `PURCHASE_DETAIL` | `purchaseId` | `NavRoute.PurchaseDetail(id)` |

---

## 9. Testing & Verification Checklist

1. **Verify Token Sync**: Log in on Android device, verify row in `user_devices` table in database with `platform = "ANDROID"`.
2. **Foreground Push Test**: Keep app open, send test payload from server API, verify native notification pops up and app stays responsive.
3. **Background Push Test**: Minimize app to home screen, send test payload, tap notification, verify app launches directly to target screen (e.g. Stock Transfer detail).
4. **Logout Verification**: Log out on Android device, verify `isActive` is set to `false` or row removed in database. Send test push to old token, verify FCM handles it gracefully.
