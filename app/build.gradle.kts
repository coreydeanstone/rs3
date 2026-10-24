plugins {
    id("com.android.application")
}

android {
    namespace = "com.coreystone.cluesolver"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.coreystone.cluesolver"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    // One shared key so locally-built and CI-built APKs can update each other.
    // This is a convenience key for a personal sideloaded app, not a Play Store key.
    signingConfigs {
        create("shared") {
            storeFile = file("cluesolver.keystore")
            storePassword = "cluesolver"
            keyAlias = "cluesolver"
            keyPassword = "cluesolver"
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("shared")
        }
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("shared")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
