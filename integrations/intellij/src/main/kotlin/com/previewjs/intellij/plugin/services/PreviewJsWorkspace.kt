package com.previewjs.intellij.plugin.services

import com.intellij.openapi.Disposable
import com.intellij.openapi.util.Disposer
import com.previewjs.intellij.plugin.api.*
import kotlinx.coroutines.runBlocking

class PreviewJsWorkspace(
    private val api: PreviewJsApi,
    private val workspaceId: String
) : Disposable {
    private var previewServer: PreviewServer? = null

    suspend fun startPreviewServer(): PreviewServer {
        previewServer?.let { return it }
        val startPreviewResponse = api.startPreview(
            StartPreviewRequest(
                workspaceId = workspaceId,
            )
        )
        val preview = PreviewServer(api, startPreviewResponse.previewId, startPreviewResponse.url)
        Disposer.register(this, preview)
        this.previewServer = preview
        return preview
    }

    suspend fun update(filePath: String, content: String) {
        api.updatePendingFile(
            UpdatePendingFileRequest(
                filePath = filePath,
                utf8Content = content
            )
        )
    }

    suspend fun analyzeFile(filePath: String, options: AnalyzeFileOptions? = null): List<AnalyzedFileComponent> {
        return api.analyzeFile(
            AnalyzeFileRequest(
                workspaceId = workspaceId,
                filePath = filePath,
                options
            )
        ).components
    }

    override fun dispose() {
        runBlocking {
            api.disposeWorkspace(
                DisposeWorkspaceRequest(
                    workspaceId = workspaceId,
                )
            )
        }
    }
}