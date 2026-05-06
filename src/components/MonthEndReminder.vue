<script setup lang="ts">
import { useNotification } from 'naive-ui'
import { useRouter } from 'vue-router'
import { useEndOfMonthReminder } from '../composables/useEndOfMonthReminder'

const notification = useNotification()
const router = useRouter()

useEndOfMonthReminder(notification, router)
</script>

<template></template>
