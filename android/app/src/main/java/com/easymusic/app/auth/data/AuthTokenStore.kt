package com.easymusic.app.auth.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

private val Context.authDataStore: DataStore<Preferences> by preferencesDataStore(
    name = "auth_session",
)

class AuthTokenStore(
    private val dataStore: DataStore<Preferences>,
) {
    constructor(context: Context) : this(context.applicationContext.authDataStore)

    val token: Flow<String?> = dataStore.data.map { preferences ->
        preferences[ACCESS_TOKEN_KEY]?.takeIf { it.isNotBlank() }
    }

    suspend fun readToken(): String? = token.first()

    suspend fun saveToken(accessToken: String) {
        require(accessToken.isNotBlank()) { "Access token must not be blank." }

        dataStore.edit { preferences ->
            preferences[ACCESS_TOKEN_KEY] = accessToken
        }
    }

    suspend fun saveCurrentUser(currentUser: CurrentUserResponse) {
        dataStore.edit { preferences ->
            preferences[CURRENT_USER_ID_KEY] = currentUser.id
            preferences[CURRENT_USERNAME_KEY] = currentUser.username
            preferences[CURRENT_USER_CREATED_AT_KEY] = currentUser.createdAt
        }
    }

    suspend fun readCurrentUser(): CurrentUserResponse? {
        val preferences = dataStore.data.first()
        val id = preferences[CURRENT_USER_ID_KEY] ?: return null
        val username = preferences[CURRENT_USERNAME_KEY]?.takeIf { it.isNotBlank() } ?: return null
        val createdAt = preferences[CURRENT_USER_CREATED_AT_KEY].orEmpty()
        return CurrentUserResponse(
            id = id,
            username = username,
            createdAt = createdAt,
        )
    }

    suspend fun clearToken() {
        dataStore.edit { preferences ->
            preferences.remove(ACCESS_TOKEN_KEY)
            preferences.remove(CURRENT_USER_ID_KEY)
            preferences.remove(CURRENT_USERNAME_KEY)
            preferences.remove(CURRENT_USER_CREATED_AT_KEY)
        }
    }

    private companion object {
        val ACCESS_TOKEN_KEY = stringPreferencesKey("access_token")
        val CURRENT_USER_ID_KEY = intPreferencesKey("current_user_id")
        val CURRENT_USERNAME_KEY = stringPreferencesKey("current_username")
        val CURRENT_USER_CREATED_AT_KEY = stringPreferencesKey("current_user_created_at")
    }
}
