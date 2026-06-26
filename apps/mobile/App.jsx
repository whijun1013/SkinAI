import "react-native-gesture-handler";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as SecureStore from "expo-secure-store";
import { useFonts } from "expo-font";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import MainTabScreen from "./src/nuvo/navigation/MainTabScreen";
import LoginScreen from "./src/nuvo/screens/auth/LoginScreen";
import OnboardingFlowEntryScreen from "./src/nuvo/screens/onboarding/OnboardingFlowEntryScreen";
import SignupScreen from "./src/nuvo/screens/auth/SignupScreen";
import SurveyScreen from "./src/nuvo/screens/onboarding/SurveyScreen";
import useAuthStore from "./src/stores/authStore";

const Stack = createNativeStackNavigator();
const PREVIEW_SURVEY = false;
const HAS_SEEN_INTRO_KEY = "has_seen_intro";

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    "Pretendard-ExtraBold": require("./assets/fonts/Pretendard-ExtraBold.otf"),
    "Pretendard-Bold": require("./assets/fonts/Pretendard-Bold.otf"),
    "Pretendard-Medium": require("./assets/fonts/Pretendard-Medium.otf"),
  });
  const {
    user,
    isAuthenticated,
    isInitializing,
    checkAuth,
    register,
    socialLogin,
  } = useAuthStore();
  const [hasSeenIntro, setHasSeenIntro] = useState(null);
  const [mainTabResetKey, setMainTabResetKey] = useState(0);
  const [loginResetKey, setLoginResetKey] = useState(0);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    let isMounted = true;

    const loadIntroState = async () => {
      try {
        const storedValue = await SecureStore.getItemAsync(HAS_SEEN_INTRO_KEY);
        if (isMounted) {
          setHasSeenIntro(storedValue === "true");
        }
      } catch {
        if (isMounted) {
          setHasSeenIntro(false);
        }
      }
    };

    loadIntroState();

    return () => {
      isMounted = false;
    };
  }, []);

  if (
    (!fontsLoaded && !fontError) ||
    isInitializing ||
    (!PREVIEW_SURVEY && hasSeenIntro === null) ||
    (!PREVIEW_SURVEY && isAuthenticated && !user)
  ) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              backgroundColor: "#fbfaf6",
            }}
          >
            <ActivityIndicator size="large" color="#4f704f" />
          </View>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {PREVIEW_SURVEY ? (
            <Stack.Screen name="SurveyPreview" component={SurveyScreen} />
          ) : isAuthenticated ? (
            user?.is_onboarded === true ? (
              <Stack.Screen name="Home">
                {() => (
                  <MainTabScreen
                    key={user?.id ?? "guest"}
                    resetKey={mainTabResetKey}
                    onLogout={() => {
                      setLoginResetKey((prev) => prev + 1);
                      setMainTabResetKey((prev) => prev + 1);
                    }}
                  />
                )}
              </Stack.Screen>
            ) : (
              <Stack.Screen name="Survey">
                {() => (
                  <SurveyScreen
                    onLogout={() => setLoginResetKey((prev) => prev + 1)}
                  />
                )}
              </Stack.Screen>
            )
          ) : (
            <>
              {!hasSeenIntro && (
                <Stack.Screen name="OnboardingFlowEntry">
                  {({ navigation }) => (
                    <OnboardingFlowEntryScreen
                      onComplete={async () => {
                        await SecureStore.setItemAsync(
                          HAS_SEEN_INTRO_KEY,
                          "true"
                        );
                        setHasSeenIntro(true);
                        navigation.navigate("Login");
                      }}
                    />
                  )}
                </Stack.Screen>
              )}
              <Stack.Screen name="Login">
                {({ navigation }) => (
                  <LoginScreen
                    resetKey={loginResetKey}
                    onLogin={() => setMainTabResetKey((prev) => prev + 1)}
                    onSignup={() => navigation.navigate("Signup")}
                    onSocialLogin={(provider) => socialLogin(provider)}
                  />
                )}
              </Stack.Screen>
              <Stack.Screen name="Signup">
                {({ navigation }) => (
                  <SignupScreen
                    onSignup={register}
                    onLoginPress={() => navigation.goBack()}
                    onSignupSuccess={() =>
                      setMainTabResetKey((prev) => prev + 1)
                    }
                  />
                )}
              </Stack.Screen>
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
