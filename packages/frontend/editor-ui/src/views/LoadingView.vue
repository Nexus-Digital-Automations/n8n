<template>
	<div :class="$style.wrapper" data-test-id="node-view-loader">
		<div :class="$style.spinner">
			<n8n-spinner />
		</div>
	</div>
</template>

<style lang="scss" module>
.wrapper {
	width: 100%;
	height: 100%;
	position: absolute;
	background-color: var(--color-background-light);
	display: flex;
	align-items: center;
	justify-content: center;
	flex-direction: column;
}

.spinner {
	margin-bottom: var(--spacing-l);

	* {
		color: var(--color-primary);
		min-height: 40px;
		min-width: 40px;
	}
}
</style>
