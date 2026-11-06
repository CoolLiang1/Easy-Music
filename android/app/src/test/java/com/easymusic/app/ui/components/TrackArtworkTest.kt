package com.easymusic.app.ui.components

import org.junit.Assert.assertEquals
import org.junit.Test

class TrackArtworkTest {
    @Test
    fun firstGlyphSkipsBracketsAndSymbols() {
        assertEquals("头", firstGlyph("【头文字D】Rage Your Dream"))
        assertEquals("M", firstGlyph("[MV] LiSA - 紅蓮華"))
        assertEquals("R", firstGlyph("  rage"))
        assertEquals("鳥", firstGlyph("鳥の詩"))
        assertEquals("♪", firstGlyph("【】!!"))
        assertEquals("♪", firstGlyph(""))
    }

    @Test
    fun placeholderHashMatchesWeb() {
        // Same 31-multiplier hash over UTF-16 units as web TrackCover.tsx stringHash.
        assertEquals(76388, placeholderHash("Lia"))
        assertEquals(placeholderHash("米津玄師"), placeholderHash("米津玄師"))
    }
}
