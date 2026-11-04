package com.easymusic.app.core.network

/**
 * Renews the signed-in session's access token. Implementations block, so call
 * them only from background threads.
 */
interface AccessTokenRenewer {
    /** Returns a token that replaces [staleAccessToken] after a 401, or null. */
    fun renewAfterUnauthorized(staleAccessToken: String): String?

    /** Returns the stored access token, renewed first if it is about to expire. */
    fun currentValidAccessToken(): String?
}

/** Process-wide renewer, installed once by the application at start-up. */
object AccessTokenRenewal {
    @Volatile
    var renewer: AccessTokenRenewer? = null
}
