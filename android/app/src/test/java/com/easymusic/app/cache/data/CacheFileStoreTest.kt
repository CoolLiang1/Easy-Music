package com.easymusic.app.cache.data

import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.net.ServerSocket
import kotlin.io.path.createTempDirectory

class CacheFileStoreTest {
    private lateinit var cacheDirectory: File
    private var serverSocket: ServerSocket? = null
    private var serverThread: Thread? = null

    @Before
    fun setUp() {
        cacheDirectory = createTempDirectory(prefix = "easy-music-cache-test").toFile()
    }

    @After
    fun tearDown() {
        serverSocket?.close()
        serverThread?.join(1_000)
        deleteKnownFile("track-42.mp3")
        deleteKnownFile("track-42.mp3.part")
        cacheDirectory.delete()
    }

    @Test
    fun finalFileForTrack_usesDeterministicSafeMp3Filename() {
        val fileStore = CacheFileStore(cacheDirectory)

        assertEquals(
            File(cacheDirectory, "track-42.mp3").absolutePath,
            fileStore.finalFileForTrack(42).absolutePath,
        )
    }

    @Test
    fun deleteCachedTrackFile_deletesOneExplicitFile() = runTest {
        val fileStore = CacheFileStore(cacheDirectory)
        val cachedFile = fileStore.finalFileForTrack(42).apply {
            parentFile?.mkdirs()
            writeBytes(byteArrayOf(1, 2, 3))
        }

        assertEquals(
            CacheFileDeleteResult.Deleted,
            fileStore.deleteCachedTrackFile(cachedFile.absolutePath),
        )

        assertFalse(cachedFile.exists())
    }

    @Test
    fun deleteCachedTrackFile_treatsMissingFileAsCleanable() = runTest {
        val fileStore = CacheFileStore(cacheDirectory)
        val cachedFile = fileStore.finalFileForTrack(42)

        assertEquals(
            CacheFileDeleteResult.Missing,
            fileStore.deleteCachedTrackFile(cachedFile.absolutePath),
        )
    }

    @Test
    fun downloadTrackStream_sendsBearerTokenAndStoresCompleteFile() = runTest {
        val expectedBytes = byteArrayOf(1, 2, 3, 4)
        var authorizationHeader: String? = null
        serverSocket = ServerSocket(0)
        serverThread = Thread {
            requireNotNull(serverSocket).accept().use { socket ->
                val request = socket.getInputStream().bufferedReader().readLinesUntilBlank()
                authorizationHeader = request
                    .firstOrNull { it.startsWith("Authorization:", ignoreCase = true) }
                    ?.substringAfter(":")
                    ?.trim()

                val header = listOf(
                    "HTTP/1.1 200 OK",
                    "Content-Type: audio/mpeg",
                    "Content-Length: ${expectedBytes.size}",
                    "Connection: close",
                    "",
                    "",
                ).joinToString("\r\n")
                socket.getOutputStream().use { output ->
                    output.write(header.toByteArray(Charsets.US_ASCII))
                    output.write(expectedBytes)
                    output.flush()
                }
            }
        }.also { thread -> thread.start() }

        val port = requireNotNull(serverSocket).localPort
        val fileStore = CacheFileStore(cacheDirectory)
        val result = fileStore.downloadTrackStream(
            trackId = 42,
            streamUrl = "http://127.0.0.1:$port/api/tracks/42/stream",
            bearerToken = "test-token",
        )

        val success = result as CacheFileDownloadResult.Success
        assertEquals("Bearer test-token", authorizationHeader)
        assertEquals(4L, success.byteSize)
        assertEquals("audio/mpeg", success.contentType)
        assertTrue(success.file.absolutePath.startsWith(cacheDirectory.absolutePath))
        assertArrayEquals(expectedBytes, success.file.readBytes())
    }

    private fun deleteKnownFile(name: String) {
        val file = File(cacheDirectory, name)
        if (file.exists() && file.isFile) {
            file.delete()
        }
    }
}

private fun java.io.BufferedReader.readLinesUntilBlank(): List<String> {
    val lines = mutableListOf<String>()
    while (true) {
        val line = readLine() ?: break
        if (line.isEmpty()) {
            break
        }
        lines += line
    }
    return lines
}
